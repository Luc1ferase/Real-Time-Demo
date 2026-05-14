"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geminiProvider } from "./gemini-provider";
import { openaiProvider } from "./openai-provider";
import type { RealtimeProvider, RealtimeSessionHandle } from "./provider";
import type {
  AssistantAudioEvent,
  FunctionCallRequest,
  ProviderId,
  SessionStatus,
  ToolDefinition,
  TranscriptEntry,
} from "./types";

export interface UseRealtimeSessionOptions {
  providerId: ProviderId;
  model: string;
  voice: string;
  instructions: string;
  tools?: ToolDefinition[];
  onFunctionCall?(call: FunctionCallRequest): void;
  /**
   * Raw assistant audio sink. Only fires for providers that surface audio
   * as a callback (Gemini). OpenAI's WebRTC transport plays audio on a
   * media track and does not invoke this.
   */
  onAssistantAudio?(event: AssistantAudioEvent): void;
}

export interface UseRealtimeSessionResult {
  status: SessionStatus;
  error: Error | null;
  transcripts: TranscriptEntry[];
  /** Open a new session. Closes any existing one first. */
  connect(): Promise<void>;
  /** Send a user text turn (works for both providers). */
  send(text: string): void;
  /** Push a raw 16-bit PCM chunk to the active session. */
  sendAudio(chunk: Int16Array): void;
  /** Swap the system instructions on the active session in place. */
  updateInstructions(instructions: string): void;
  /** Cancel the in-flight assistant response. */
  interrupt(): void;
  /** Close and release the underlying transport. */
  disconnect(): void;
  /** Return a function-call result by call id. */
  returnFunctionResult(callId: string, output: unknown): void;
}

function pickProvider(id: ProviderId): RealtimeProvider {
  return id === "openai" ? openaiProvider : geminiProvider;
}

function nextId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useRealtimeSession(
  options: UseRealtimeSessionOptions,
): UseRealtimeSessionResult {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);

  // Refs hold mutable session state without triggering re-renders. We also
  // track an `epoch` counter so stale callbacks (e.g. from a closed session)
  // are ignored — important under React StrictMode which double-invokes
  // effects in development.
  const handleRef = useRef<RealtimeSessionHandle | null>(null);
  const epochRef = useRef(0);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const appendUserTranscript = useCallback(
    (text: string, done: boolean) => {
      setTranscripts((prev) => {
        const last = prev[prev.length - 1];
        // If the in-flight tail is an unfinished user entry, merge into it.
        // OpenAI emits only finals (done=true with full text) — that flow
        // falls through to the push branch below since there is no prior
        // partial. Gemini streams partials that share this branch and
        // accumulate cleanly into one entry.
        if (last && last.role === "user" && !last.done) {
          const merged: TranscriptEntry = {
            ...last,
            text: text.length > 0 ? last.text + text : last.text,
            done,
          };
          return [...prev.slice(0, -1), merged];
        }
        if (text.length === 0 && done) {
          // Stray end-of-turn with nothing to attach to — ignore.
          return prev;
        }
        return [
          ...prev,
          {
            id: nextId(),
            role: "user",
            text,
            done,
            createdAt: Date.now(),
          },
        ];
      });
    },
    [],
  );

  const appendAssistantTranscript = useCallback(
    (text: string, done: boolean) => {
      setTranscripts((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && !last.done) {
          // Append to the in-flight entry. If `done` arrives with empty text,
          // just flip the flag — the SDK signals "audio done" that way.
          const merged: TranscriptEntry = {
            ...last,
            text: text.length > 0 ? last.text + text : last.text,
            done,
          };
          return [...prev.slice(0, -1), merged];
        }
        if (text.length === 0 && done) {
          // No active assistant entry to close — ignore stray done.
          return prev;
        }
        return [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            text,
            done,
            createdAt: Date.now(),
          },
        ];
      });
    },
    [],
  );

  const connect = useCallback(async () => {
    // Cancel any in-flight session first.
    if (handleRef.current) {
      try {
        handleRef.current.close();
      } catch {
        /* swallow — close races with our own setState are expected */
      }
      handleRef.current = null;
    }
    epochRef.current += 1;
    const myEpoch = epochRef.current;
    setStatus("connecting");
    setError(null);
    setTranscripts([]);

    const opts = optionsRef.current;
    const provider = pickProvider(opts.providerId);

    try {
      const handle = await provider.connect({
        model: opts.model,
        voice: opts.voice,
        instructions: opts.instructions,
        tools: opts.tools,
        onUserTranscript: ({ text, done }) => {
          if (epochRef.current !== myEpoch) return;
          // OpenAI omits `done` (always final); treat undefined as true.
          appendUserTranscript(text, done ?? true);
        },
        onAssistantTranscript: ({ text, done }) => {
          if (epochRef.current !== myEpoch) return;
          appendAssistantTranscript(text, done);
        },
        onAssistantAudio: (event) => {
          if (epochRef.current !== myEpoch) return;
          optionsRef.current.onAssistantAudio?.(event);
        },
        onFunctionCall: (call) => {
          if (epochRef.current !== myEpoch) return;
          optionsRef.current.onFunctionCall?.(call);
        },
        onError: (err) => {
          if (epochRef.current !== myEpoch) return;
          setError(err);
          setStatus("error");
        },
        onClose: () => {
          if (epochRef.current !== myEpoch) return;
          setStatus((cur) => (cur === "error" ? cur : "closed"));
        },
      });
      if (epochRef.current !== myEpoch) {
        // A newer connect() superseded us while we were awaiting — discard.
        handle.close();
        return;
      }
      handleRef.current = handle;
      setStatus("connected");
    } catch (e) {
      if (epochRef.current !== myEpoch) return;
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setStatus("error");
    }
  }, [appendAssistantTranscript, appendUserTranscript]);

  const send = useCallback((text: string) => {
    handleRef.current?.sendUserText(text);
  }, []);

  const sendAudio = useCallback((chunk: Int16Array) => {
    handleRef.current?.sendUserAudio?.(chunk);
  }, []);

  const updateInstructions = useCallback((instructions: string) => {
    handleRef.current?.updateInstructions(instructions);
  }, []);

  const interrupt = useCallback(() => {
    handleRef.current?.interrupt();
  }, []);

  const disconnect = useCallback(() => {
    epochRef.current += 1;
    if (handleRef.current) {
      try {
        handleRef.current.close();
      } catch {
        /* ignore */
      }
      handleRef.current = null;
    }
    setStatus("closed");
  }, []);

  const returnFunctionResult = useCallback(
    (callId: string, output: unknown) => {
      handleRef.current?.returnFunctionResult(callId, output);
    },
    [],
  );

  // Cleanup on unmount. StrictMode invokes this twice in dev — the second
  // mount will start a fresh session via an explicit `connect()` call from
  // the page, so we tear down unconditionally here.
  useEffect(() => {
    return () => {
      epochRef.current += 1;
      if (handleRef.current) {
        try {
          handleRef.current.close();
        } catch {
          /* ignore */
        }
        handleRef.current = null;
      }
    };
  }, []);

  return useMemo(
    () => ({
      status,
      error,
      transcripts,
      connect,
      send,
      sendAudio,
      updateInstructions,
      interrupt,
      disconnect,
      returnFunctionResult,
    }),
    [
      status,
      error,
      transcripts,
      connect,
      send,
      sendAudio,
      updateInstructions,
      interrupt,
      disconnect,
      returnFunctionResult,
    ],
  );
}
