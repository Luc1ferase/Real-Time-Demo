"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LanguageCode } from "./languages";

/**
 * Self-contained React hook that drives a `gpt-realtime-translate`
 * session over WebRTC. Intentionally NOT plumbed through the
 * `RealtimeProvider` abstraction in `src/lib/realtime/` — translation
 * sessions are continuous (no turn lifecycle, no tools, no
 * instructions, no voice) and would corrupt the chat-oriented
 * provider contract. See
 * `research/translator-session-shape.md` for the wire shape.
 */

export type TranslatorStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error"
  | "closed";

/**
 * One paired row in the translator's transcript: a source utterance
 * and its translated counterpart. We mint a stable id at row-creation
 * time so React keys stay stable across delta merges.
 */
export interface PairedEntry {
  id: string;
  sourceText: string;
  translatedText: string;
  createdAt: number;
  /**
   * Internal flag — true once we've seen punctuation or a long gap
   * since the last delta on either side. New deltas after this point
   * start a new row instead of merging into this one.
   */
  closed: boolean;
}

export interface UseTranslatorSessionOptions {
  sourceLang: LanguageCode | "auto";
  targetLang: LanguageCode;
  /** Surface fatal errors to the caller. */
  onError?(err: Error): void;
}

export interface UseTranslatorSessionResult {
  status: TranslatorStatus;
  error: Error | null;
  entries: PairedEntry[];
  /** Open a fresh session, closing any prior one. */
  start(): Promise<void>;
  /** Cleanly close the active session. */
  stop(): void;
}

interface TokenResponse {
  value?: string;
  error?: string;
  detail?: string;
}

const TOKEN_ENDPOINT = "/api/realtime/translator-token";
const SDP_ENDPOINT =
  "https://api.openai.com/v1/realtime/translations/calls";
/**
 * Gap (ms) after which the next delta on EITHER side starts a fresh
 * row. The translator server streams continuously with no per-turn
 * boundary, so we rely on quiet gaps + sentence-terminator punctuation
 * (handled in the merge fn) to bucket pairs.
 */
const NEW_ROW_GAP_MS = 1200;
/** Sentence-terminators that close the current row. */
const TERMINATORS = /[.!?。！？]/;

function nextId(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function mintToken(
  sourceLang: LanguageCode | "auto",
  targetLang: LanguageCode,
): Promise<string> {
  const body: Record<string, unknown> = { target_language: targetLang };
  if (sourceLang !== "auto") body.source_language = sourceLang;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as TokenResponse;
    const detail = data.detail ?? data.error ?? (await res.text().catch(() => ""));
    throw new Error(
      `translator token endpoint failed (${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  const data = (await res.json()) as TokenResponse;
  if (!data.value) {
    throw new Error("translator token endpoint returned no ephemeral key");
  }
  return data.value;
}

/**
 * Decide whether the current tail entry should accept `incoming` text
 * on `side`, or whether a brand-new row should be pushed. Returns the
 * mutated entry list.
 *
 * Known limitations of this purely-temporal heuristic (acceptable for
 * this project, candidates for PR6+):
 *   - A long mid-sentence pause (> NEW_ROW_GAP_MS) splits one thought
 *     into two paired rows. Switching to `elapsed_ms`-based pairing
 *     (the field is on every delta event) would be the real fix —
 *     see research/translator-session-shape.md §3.
 *   - We trust arrival order; deltas reordered by network jitter would
 *     append in the wrong sequence. WebRTC data channels preserve
 *     order so this is unlikely in practice.
 */
function mergeDelta(
  prev: PairedEntry[],
  side: "source" | "translated",
  delta: string,
  now: number,
): PairedEntry[] {
  if (!delta) return prev;
  const tail = prev[prev.length - 1];
  const shouldStartNew =
    !tail ||
    tail.closed ||
    now - tail.createdAt > NEW_ROW_GAP_MS;

  if (shouldStartNew) {
    const next: PairedEntry = {
      id: nextId(),
      sourceText: side === "source" ? delta : "",
      translatedText: side === "translated" ? delta : "",
      createdAt: now,
      closed: TERMINATORS.test(delta),
    };
    return [...prev, next];
  }

  // Append into the tail.
  const merged: PairedEntry = {
    ...tail,
    sourceText:
      side === "source" ? tail.sourceText + delta : tail.sourceText,
    translatedText:
      side === "translated"
        ? tail.translatedText + delta
        : tail.translatedText,
    // Close the row once we see a terminator on either side. This
    // gives the next delta its own row instead of running on.
    closed: tail.closed || TERMINATORS.test(delta),
  };
  return [...prev.slice(0, -1), merged];
}

/**
 * Internal handle returned by `openTranslatorPeer`. The hook closes
 * the peer in `stop()` and on unmount.
 */
interface PeerHandle {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  stop(): void;
}

async function openTranslatorPeer(args: {
  ephemeralKey: string;
  onEvent(event: { type?: string; delta?: string }): void;
  onDisconnect(): void;
  onError(err: Error): void;
}): Promise<PeerHandle> {
  const { ephemeralKey, onEvent, onDisconnect, onError } = args;

  const pc = new RTCPeerConnection();

  // The translator's remote audio is the translated speech. Mount an
  // <audio> element and let the browser play it. Detached from the DOM
  // tree — autoplay does not require attachment, and keeping it out
  // means consumers don't have to worry about z-index or layout.
  const audioEl = document.createElement("audio");
  audioEl.autoplay = true;
  pc.ontrack = (ev) => {
    if (ev.streams[0]) audioEl.srcObject = ev.streams[0];
  };

  // Capture mic and add the track to the peer. Echo cancellation is
  // critical: without it the translator hears its own translated speech
  // and tries to translate it back, immediately looping.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }

  // Data channel for events. Name is fixed by OpenAI's protocol.
  const dc = pc.createDataChannel("oai-events");
  dc.addEventListener("message", (e) => {
    try {
      const parsed = JSON.parse(e.data as string) as {
        type?: string;
        delta?: string;
      };
      onEvent(parsed);
    } catch {
      // Malformed event — translator sessions occasionally send keep-
      // alive pings that aren't JSON. Swallow.
    }
  });
  dc.addEventListener("close", onDisconnect);

  pc.addEventListener("connectionstatechange", () => {
    if (
      pc.connectionState === "failed" ||
      pc.connectionState === "disconnected" ||
      pc.connectionState === "closed"
    ) {
      onDisconnect();
    }
  });

  // SDP exchange. Note the translator-specific endpoint — NOT
  // /v1/realtime/calls. See research doc §2.
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const sdpResponse = await fetch(SDP_ENDPOINT, {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${ephemeralKey}`,
      "Content-Type": "application/sdp",
    },
  });
  if (!sdpResponse.ok) {
    const detail = await sdpResponse.text().catch(() => "");
    stream.getTracks().forEach((t) => t.stop());
    pc.close();
    throw new Error(
      `Translation SDP exchange failed (${sdpResponse.status})${
        detail ? `: ${detail.slice(0, 200)}` : ""
      }`,
    );
  }
  const answerSdp = await sdpResponse.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      // Send a graceful close event so the server flushes pending
      // output. Best-effort — if the channel is already dead this is
      // a no-op.
      if (dc.readyState === "open") {
        dc.send(JSON.stringify({ type: "session.close" }));
      }
    } catch {
      /* swallow */
    }
    try {
      dc.close();
    } catch {
      /* swallow */
    }
    stream.getTracks().forEach((t) => t.stop());
    try {
      pc.close();
    } catch {
      /* swallow */
    }
    audioEl.srcObject = null;
  };

  // Bubble unexpected DC errors up.
  dc.addEventListener("error", () => {
    onError(new Error("translator data channel error"));
  });

  return { pc, audioEl, stop };
}

export function useTranslatorSession(
  options: UseTranslatorSessionOptions,
): UseTranslatorSessionResult {
  const [status, setStatus] = useState<TranslatorStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [entries, setEntries] = useState<PairedEntry[]>([]);

  // The active peer handle lives in a ref — open/close races and
  // StrictMode double-mounts must not orphan a connection. We bump an
  // epoch counter on every start so stale callbacks ignore state from
  // a now-closed session.
  const handleRef = useRef<PeerHandle | null>(null);
  const epochRef = useRef(0);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const closePeer = useCallback(() => {
    if (handleRef.current) {
      try {
        handleRef.current.stop();
      } catch {
        /* swallow */
      }
      handleRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    closePeer();
    epochRef.current += 1;
    const myEpoch = epochRef.current;
    setStatus("connecting");
    setError(null);
    setEntries([]);

    const opts = optionsRef.current;

    try {
      const ephemeralKey = await mintToken(opts.sourceLang, opts.targetLang);
      if (epochRef.current !== myEpoch) return;

      const peer = await openTranslatorPeer({
        ephemeralKey,
        onEvent: (event) => {
          if (epochRef.current !== myEpoch) return;
          if (!event.type) return;
          // Two delta event types — input is source-language transcript
          // (only emitted because we configured audio.input.transcription
          // in the token route), output is translated transcript. Both
          // stream continuously; the merge fn handles bucketing.
          if (event.type === "session.input_transcript.delta" && event.delta) {
            setEntries((prev) =>
              mergeDelta(prev, "source", event.delta ?? "", Date.now()),
            );
          } else if (
            event.type === "session.output_transcript.delta" &&
            event.delta
          ) {
            setEntries((prev) =>
              mergeDelta(prev, "translated", event.delta ?? "", Date.now()),
            );
          } else if (event.type === "session.closed") {
            // Server-initiated close (e.g. 60-min hard cap).
            closePeer();
            setStatus((cur) => (cur === "error" ? cur : "closed"));
          } else if (event.type === "error") {
            const msg = (event as { error?: { message?: string } }).error
              ?.message ?? "translator session error";
            const err = new Error(msg);
            setError(err);
            setStatus("error");
            optionsRef.current.onError?.(err);
          }
        },
        onDisconnect: () => {
          if (epochRef.current !== myEpoch) return;
          setStatus((cur) => (cur === "error" ? cur : "closed"));
        },
        onError: (err) => {
          if (epochRef.current !== myEpoch) return;
          setError(err);
          setStatus("error");
          optionsRef.current.onError?.(err);
        },
      });

      if (epochRef.current !== myEpoch) {
        peer.stop();
        return;
      }
      handleRef.current = peer;
      setStatus("connected");
    } catch (e) {
      if (epochRef.current !== myEpoch) return;
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setStatus("error");
      optionsRef.current.onError?.(err);
    }
  }, [closePeer]);

  const stop = useCallback(() => {
    epochRef.current += 1;
    closePeer();
    setStatus("closed");
  }, [closePeer]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      epochRef.current += 1;
      closePeer();
    };
  }, [closePeer]);

  return useMemo(
    () => ({ status, error, entries, start, stop }),
    [status, error, entries, start, stop],
  );
}
