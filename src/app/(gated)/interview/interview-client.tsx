"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LiveScreen } from "@/components/interview/live-screen";
import { Scorecard } from "@/components/interview/scorecard";
import {
  StartScreen,
  type StartScreenSelection,
} from "@/components/interview/start-screen";
import { startAudioCapture } from "@/lib/realtime/audio-capture";
import type { AudioCaptureHandle } from "@/lib/realtime/audio-capture";
import {
  createAudioPlayback,
  type AudioPlaybackHandle,
} from "@/lib/realtime/audio-playback";
import {
  buildInstructions,
  type InterviewStage,
} from "@/lib/realtime/interview-instructions";
import {
  INTERVIEW_TOOLS,
  isValidStage,
  parseScorecardArgs,
  type ScorecardPayload,
} from "@/lib/realtime/interview-tools";
import {
  useRealtimeSession,
  type UseRealtimeSessionResult,
} from "@/lib/realtime/use-realtime-session";
import type {
  FunctionCallRequest,
  ProviderId,
} from "@/lib/realtime/types";

/**
 * High-level phases of the /interview screen. The Realtime hook has its own
 * `status` (idle/connecting/connected/error/closed); we layer this on top
 * so the UI can also model `configuring` (between idle and connecting) and
 * `finished` (after the AI calls `generate_scorecard`).
 */
type Phase =
  | "configuring"
  | "connecting"
  | "live"
  | "finished"
  | "error";

const DEFAULT_SELECTION: StartScreenSelection = {
  providerId: "gemini",
  job: "fullstack",
  difficulty: "medium",
};

const MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  openai: "gpt-realtime-2",
  gemini: "gemini-3.1-flash-live-preview",
};

const VOICE_BY_PROVIDER: Record<ProviderId, string> = {
  openai: "marin",
  gemini: "Puck",
};

const INPUT_RATE_BY_PROVIDER: Record<ProviderId, number> = {
  openai: 24000,
  gemini: 16000,
};

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const HARD_CAP_WARNING_MS = 59 * 60 * 1000;

export function InterviewClient() {
  const [phase, setPhase] = useState<Phase>("configuring");
  const [selection, setSelection] = useState<StartScreenSelection>(
    DEFAULT_SELECTION,
  );
  // The active selection is frozen the moment the user clicks "Start". The
  // start-screen `selection` may keep changing if they go back to configure
  // another run — we never read it from the live screen.
  const [activeSelection, setActiveSelection] =
    useState<StartScreenSelection | null>(null);
  const [stage, setStage] = useState<InterviewStage>("warmup");
  const [scorecard, setScorecard] = useState<ScorecardPayload | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [micActive, setMicActive] = useState(false);

  // Individual refs (not bundled) so the React Compiler can recognize each
  // `useRef` site and allow `.current =` assignment. A bundled bag tripped
  // the `Modifying a value returned from a hook` rule.
  const captureRef = useRef<AudioCaptureHandle | null>(null);
  const playbackRef = useRef<AudioPlaybackHandle | null>(null);
  const sessionRef = useRef<UseRealtimeSessionResult | null>(null);
  const stageRef = useRef<InterviewStage>("warmup");
  const activeSelectionRef = useRef<StartScreenSelection | null>(null);
  const lastUserActivityRef = useRef<number>(0);

  // Mirror selected pieces of state into refs so async paths (tool
  // callbacks, watchdog interval) read freshest values.
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  useEffect(() => {
    activeSelectionRef.current = activeSelection;
  }, [activeSelection]);

  const teardownAudio = useCallback(() => {
    if (captureRef.current) {
      void captureRef.current.stop();
      captureRef.current = null;
    }
    if (playbackRef.current) {
      void playbackRef.current.dispose();
      playbackRef.current = null;
    }
    setMicActive(false);
  }, []);

  /**
   * Tool-call handler. Both `advance_stage` and `generate_scorecard`
   * dispatch through here. The handler must call
   * `session.returnFunctionResult(callId, output)` so the model can
   * verbalize the outcome — that's the design contract enforced by the
   * provider abstraction.
   */
  const handleFunctionCall = useCallback(
    (call: FunctionCallRequest) => {
      const liveSession = sessionRef.current;
      if (!liveSession) return;

      if (call.name === "advance_stage") {
        const nextRaw = call.arguments?.next_stage;
        if (!isValidStage(nextRaw)) {
          liveSession.returnFunctionResult(call.callId, {
            ok: false,
            error:
              "Invalid next_stage; expected one of warmup|technical|behavioral|feedback",
          });
          return;
        }
        const sel = activeSelectionRef.current;
        if (!sel) {
          liveSession.returnFunctionResult(call.callId, {
            ok: false,
            error: "Interview not configured",
          });
          return;
        }
        stageRef.current = nextRaw;
        setStage(nextRaw);
        const newInstructions = buildInstructions({
          job: sel.job,
          difficulty: sel.difficulty,
          stage: nextRaw,
        });
        liveSession.updateInstructions(newInstructions);
        liveSession.returnFunctionResult(call.callId, {
          ok: true,
          current_stage: nextRaw,
        });
        return;
      }

      if (call.name === "generate_scorecard") {
        const payload = parseScorecardArgs(call.arguments ?? {});
        if (!payload) {
          liveSession.returnFunctionResult(call.callId, {
            ok: false,
            error:
              "Scorecard requires numeric scores and a non-empty summary",
          });
          return;
        }
        setScorecard(payload);
        liveSession.returnFunctionResult(call.callId, { ok: true });
        // Let the AI deliver its sign-off line first, then close.
        window.setTimeout(() => {
          teardownAudio();
          sessionRef.current?.disconnect();
          setPhase("finished");
        }, 3500);
        return;
      }

      liveSession.returnFunctionResult(call.callId, {
        ok: false,
        error: `Unknown tool: ${call.name}`,
      });
    },
    [teardownAudio],
  );

  // Initial instructions for the warmup stage; only meaningful while the
  // hook is constructing a session. After connect, the stage swap path
  // (`updateInstructions`) drives every change.
  const initialInstructions = useMemo(() => {
    const sel = activeSelection ?? selection;
    return buildInstructions({
      job: sel.job,
      difficulty: sel.difficulty,
      stage: "warmup",
    });
  }, [activeSelection, selection]);

  const providerForHook = activeSelection?.providerId ?? selection.providerId;

  const handleAssistantAudio = useCallback(
    ({ pcm, sampleRate }: { pcm: Int16Array; sampleRate: number }) => {
      // OpenAI's WebRTC transport never invokes this — only Gemini does.
      playbackRef.current?.enqueue(pcm, sampleRate);
    },
    [],
  );

  const session = useRealtimeSession({
    providerId: providerForHook,
    model: MODEL_BY_PROVIDER[providerForHook],
    voice: VOICE_BY_PROVIDER[providerForHook],
    instructions: initialInstructions,
    tools: INTERVIEW_TOOLS,
    onFunctionCall: handleFunctionCall,
    onAssistantAudio: handleAssistantAudio,
  });

  // Mirror the latest session handle into a ref every render so async
  // closures (tool callbacks, mic worklet onChunk) see the freshest hook
  // value without participating in dep arrays.
  useEffect(() => {
    sessionRef.current = session;
  });

  const lastUserText = useMemo(() => {
    for (let i = session.transcripts.length - 1; i >= 0; i--) {
      const entry = session.transcripts[i];
      if (entry.role === "user") return entry.text;
    }
    return "";
  }, [session.transcripts]);

  // Reset idle clock whenever the user's transcript text changes.
  useEffect(() => {
    if (lastUserText.length > 0) {
      lastUserActivityRef.current = Date.now();
    }
  }, [lastUserText]);

  const sessionStatus = session.status;
  const sessionError = session.error;

  // Effect: react to connection success — spin up mic/playback for Gemini.
  // OpenAI manages mic + speakers via its own SDK.
  useEffect(() => {
    if (sessionStatus !== "connected") return;
    const sel = activeSelectionRef.current;
    if (!sel) return;
    setConnectedAt(Date.now());
    lastUserActivityRef.current = Date.now();
    setPhase("live");

    if (sel.providerId === "openai") {
      setMicActive(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        playbackRef.current = createAudioPlayback();
        const capture = await startAudioCapture({
          targetSampleRate: INPUT_RATE_BY_PROVIDER[sel.providerId],
          onChunk: (chunk) => {
            sessionRef.current?.sendAudio(chunk);
          },
          onError: (err) => {
            setTerminalError(err.message);
          },
        });
        if (cancelled) {
          await capture.stop();
          return;
        }
        captureRef.current = capture;
        setMicActive(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setTerminalError(`Microphone init failed: ${message}`);
        setPhase("error");
        sessionRef.current?.disconnect();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  // Effect: react to error or unexpected close. We defer the setState
  // batch to a microtask so the React Compiler's "no setState directly in
  // an effect body" rule is satisfied — the underlying transition is the
  // realtime transport closing/erroring, which is an external event and
  // genuinely needs to project into local state.
  useEffect(() => {
    if (sessionStatus !== "error" && sessionStatus !== "closed") return;
    const isError = sessionStatus === "error";
    const errorMessage = sessionError?.message ?? "Unknown realtime error";
    queueMicrotask(() => {
      if (isError) {
        setTerminalError(errorMessage);
        setPhase("error");
      } else {
        setPhase((current) =>
          current === "finished" || current === "error"
            ? current
            : "configuring",
        );
        setConnectedAt(null);
      }
      teardownAudio();
    });
  }, [sessionStatus, sessionError, teardownAudio]);

  // Idle + hard-cap watchdog. One interval covers both because they share
  // a clock and the work is trivial.
  useEffect(() => {
    if (phase !== "live" || connectedAt === null) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - connectedAt;
      const idleFor = now - lastUserActivityRef.current;

      if (idleFor >= IDLE_TIMEOUT_MS) {
        setWarningMessage(
          "Session paused — no audio detected for 10 minutes. Disconnecting.",
        );
        teardownAudio();
        sessionRef.current?.disconnect();
        return;
      }

      if (elapsed >= HARD_CAP_WARNING_MS) {
        setWarningMessage((cur) =>
          cur ??
          "Heads up: this session will hit the provider's 60-minute hard cap in about 60 seconds.",
        );
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase, connectedAt, teardownAudio]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      teardownAudio();
    };
  }, [teardownAudio]);

  const handleStart = useCallback(() => {
    stageRef.current = "warmup";
    activeSelectionRef.current = selection;
    setStage("warmup");
    setScorecard(null);
    setWarningMessage(null);
    setTerminalError(null);
    setActiveSelection(selection);
    setPhase("connecting");
    // `session.connect()` reads the hook's internal `optionsRef` which is
    // synced via a post-commit effect. To make sure the freshest options
    // (new providerId / model / voice) have been committed before we dial,
    // we trigger the connect from the effect below that watches `phase`
    // transitioning into "connecting".
  }, [selection]);

  // Kick the real connect after render commits with the new
  // `activeSelection` (and therefore the new hook options). Watching
  // `phase === "connecting"` together with `providerForHook` guarantees
  // ordering: render → hook options committed → connect dialed.
  useEffect(() => {
    if (phase !== "connecting") return;
    if (sessionStatus !== "idle" && sessionStatus !== "closed" && sessionStatus !== "error") {
      return;
    }
    void session.connect();
  }, [phase, providerForHook, sessionStatus, session]);

  const handleEnd = useCallback(() => {
    teardownAudio();
    session.disconnect();
    setPhase("configuring");
    setConnectedAt(null);
    setActiveSelection(null);
  }, [session, teardownAudio]);

  const handleRestart = useCallback(() => {
    setScorecard(null);
    setStage("warmup");
    setWarningMessage(null);
    setTerminalError(null);
    setConnectedAt(null);
    setActiveSelection(null);
    setPhase("configuring");
  }, []);

  if (phase === "finished" && scorecard) {
    return <Scorecard scorecard={scorecard} onRestart={handleRestart} />;
  }

  if (phase === "error") {
    return (
      <section className="mx-auto w-full max-w-2xl space-y-4 px-6 py-10">
        <h1 className="text-2xl font-semibold">Interview failed to start</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {terminalError ?? "Unknown error."}
        </p>
        <Button type="button" onClick={handleRestart}>
          Try again
        </Button>
      </section>
    );
  }

  if (phase === "live" || phase === "connecting") {
    return (
      <LiveScreen
        stage={stage}
        transcripts={session.transcripts}
        connectedAt={connectedAt}
        micActive={micActive}
        warningMessage={
          phase === "connecting"
            ? "Connecting to the interviewer…"
            : warningMessage
        }
        onEnd={handleEnd}
      />
    );
  }

  // Default: configuring
  return (
    <StartScreen
      selection={selection}
      onChange={setSelection}
      onStart={handleStart}
      busy={phase !== "configuring"}
    />
  );
}
