"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LiveScreen } from "@/components/translator/live-screen";
import {
  StartScreen,
  type TranslatorStartSelection,
} from "@/components/translator/start-screen";
import { labelFor } from "@/lib/translator/languages";
import { useTranslatorSession } from "@/lib/translator/use-translator-session";

/**
 * Phase machine for the /translator route.
 *
 * idle → configuring (pickers) → connecting → live → ended
 *                                    ↘                 ↗
 *                                       error (terminal, retry)
 *
 * `idle` is unobservable to the user: the page mounts straight into
 * `configuring`. `ended` is functionally a frozen `live` screen — the
 * paired transcript stays on-screen so the user can copy text.
 */
type Phase = "configuring" | "connecting" | "live" | "ended" | "error";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const HARD_CAP_WARNING_MS = 59 * 60 * 1000;

const DEFAULT_SELECTION: TranslatorStartSelection = {
  sourceLang: "auto",
  targetLang: "en",
};

export function TranslatorClient() {
  const [phase, setPhase] = useState<Phase>("configuring");
  const [selection, setSelection] =
    useState<TranslatorStartSelection>(DEFAULT_SELECTION);
  const [activeSelection, setActiveSelection] =
    useState<TranslatorStartSelection | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(
    null,
  );

  // Proactive probe: if the server reports OPENAI_API_KEY missing, we
  // surface the notice up front and keep the Start button disabled,
  // instead of letting the user click and bounce off a 503. /env-check
  // itself failing is treated as "available" so a transient probe
  // failure can't permanently lock the page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/realtime/env-check", { method: "GET" });
        if (!res.ok) return;
        const data = (await res.json()) as { openai?: boolean };
        if (cancelled) return;
        if (data.openai === false) {
          queueMicrotask(() => {
            if (cancelled) return;
            setUnavailableMessage(
              "The translator requires OPENAI_API_KEY on the server. Ask the project owner to enable it.",
            );
          });
        }
      } catch {
        // Probe failed (network blip, 5xx). Treat as available — the
        // mint route will still 503 if the key is truly missing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Activity ref drives the idle watchdog — bumped every time a new
  // source-language transcript entry appears (i.e. user spoke).
  const lastUserActivityRef = useRef<number>(0);

  const session = useTranslatorSession({
    sourceLang: selection.sourceLang,
    targetLang: selection.targetLang,
  });
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });

  // React to session status transitions. We hoist these into a single
  // effect so the phase machine has one source of truth. State updates
  // are queued into a microtask to satisfy the React Compiler's
  // "no setState directly in an effect body" rule — the transition is
  // driven by an external store (the WebRTC peer's connection state).
  const sessionStatus = session.status;
  const sessionError = session.error;
  useEffect(() => {
    if (sessionStatus === "connected") {
      queueMicrotask(() => {
        setPhase("live");
        setConnectedAt((cur) => cur ?? Date.now());
        lastUserActivityRef.current = Date.now();
      });
      return;
    }
    if (sessionStatus === "error") {
      // The token route returns 503 with detail mentioning the missing
      // key when OPENAI_API_KEY is absent. Bounce to the configuring
      // screen with an inline notice instead of a terminal error.
      const msg = sessionError?.message ?? "Unknown translator error";
      const isMissingKey =
        msg.toLowerCase().includes("openai_api_key") || msg.includes("503");
      queueMicrotask(() => {
        if (isMissingKey) {
          setUnavailableMessage(
            "The translator requires OPENAI_API_KEY on the server. Ask the project owner to enable it.",
          );
          setPhase("configuring");
          setConnectedAt(null);
        } else {
          setPhase("error");
          setConnectedAt(null);
        }
      });
      return;
    }
    if (sessionStatus === "closed") {
      // Closed mid-flight is treated as "ended" so the transcript stays
      // visible. Closed before connecting (rare) falls back to
      // configuring.
      queueMicrotask(() => {
        setPhase((cur) => {
          if (cur === "live") return "ended";
          if (cur === "connecting") return "configuring";
          return cur;
        });
        setConnectedAt(null);
      });
    }
  }, [sessionStatus, sessionError]);

  // Bump idle timer whenever the user produces a new source utterance.
  // We key off the number of entries with non-empty source text — that
  // grows once per spoken utterance regardless of streaming deltas.
  const entriesWithSource = session.entries.filter(
    (e) => e.sourceText.length > 0,
  ).length;
  useEffect(() => {
    if (entriesWithSource > 0) {
      lastUserActivityRef.current = Date.now();
    }
  }, [entriesWithSource]);

  // Idle + hard-cap watchdog. Same pattern as /interview.
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
        sessionRef.current?.stop();
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
  }, [phase, connectedAt]);

  const handleStart = useCallback(() => {
    setUnavailableMessage(null);
    setWarningMessage(null);
    setActiveSelection(selection);
    setPhase("connecting");
    void session.start();
  }, [selection, session]);

  const handleEnd = useCallback(() => {
    session.stop();
    // Cancel during connecting bounces back to the picker — the user
    // never actually started a session so there's nothing to "end".
    // After a live session we land in "ended" (frozen transcript view).
    setPhase((cur) => (cur === "connecting" ? "configuring" : "ended"));
    setConnectedAt(null);
  }, [session]);

  const handleReset = useCallback(() => {
    session.stop();
    setActiveSelection(null);
    setConnectedAt(null);
    setWarningMessage(null);
    setPhase("configuring");
  }, [session]);

  // Source/target labels for the live header + paired transcript. Use
  // the active selection while live so a mid-config edit on the
  // start-screen (which is unmounted at that point anyway) doesn't
  // leak into the labels.
  const live = activeSelection ?? selection;
  const sourceLabel =
    live.sourceLang === "auto"
      ? "Detected source"
      : labelFor(live.sourceLang);
  const targetLabel = labelFor(live.targetLang);

  if (phase === "error") {
    return (
      <section className="mx-auto w-full max-w-2xl space-y-4 px-6 py-10">
        <h1 className="text-2xl font-semibold">Translator failed to start</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {session.error?.message ?? "Unknown error."}
        </p>
        <Button type="button" onClick={handleReset}>
          Try again
        </Button>
      </section>
    );
  }

  if (phase === "live" || phase === "connecting" || phase === "ended") {
    return (
      <>
        <LiveScreen
          entries={session.entries}
          connectedAt={connectedAt}
          micActive={phase === "live"}
          sourceLabel={sourceLabel}
          targetLabel={targetLabel}
          warningMessage={
            phase === "connecting"
              ? "Connecting to the translator…"
              : warningMessage
          }
          onEnd={handleEnd}
        />
        {phase === "ended" ? (
          <div className="mx-auto mt-4 flex w-full max-w-3xl justify-end px-6">
            <Button type="button" onClick={handleReset}>
              Start another
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  // configuring
  return (
    <StartScreen
      selection={selection}
      onChange={setSelection}
      onStart={handleStart}
      busy={phase !== "configuring"}
      unavailableMessage={unavailableMessage}
    />
  );
}
