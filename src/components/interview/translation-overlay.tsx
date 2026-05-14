"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProviderId, TranscriptEntry } from "@/lib/realtime/types";
import type { TranslationTargetLang } from "@/lib/settings/types";

interface TranslationLine {
  id: string;
  original: string;
  translated: string;
  ts: number;
  /** True while waiting on /api/translate. */
  pending: boolean;
}

interface TranslationOverlayProps {
  transcripts: TranscriptEntry[];
  provider: ProviderId;
  targetLang: TranslationTargetLang;
  /** Max number of recent lines to show in the banner. */
  maxLines?: number;
}

/**
 * Read-only consumer of `transcripts`. For each newly-finalized assistant
 * entry it kicks off a single `/api/translate` request. Already-translated
 * entries are tracked by transcript id (not text) so streaming partials
 * don't accidentally trigger N translations.
 *
 * The overlay never modifies the underlying Realtime session — turning it
 * on or off is invisible to the running connection.
 */
export function TranslationOverlay({
  transcripts,
  provider,
  targetLang,
  maxLines = 3,
}: TranslationOverlayProps) {
  const [lines, setLines] = useState<TranslationLine[]>([]);
  // The Set is intentionally a ref (not state): it tracks "have we
  // already dispatched a translate request for this transcript id" and
  // never needs to participate in re-renders.
  const dispatchedRef = useRef<Set<string>>(new Set());

  // Reset dispatched cache when targetLang or provider changes — we want
  // a clean run if the user re-translates the same conversation into a
  // different language. setState is deferred into a microtask so the
  // React Compiler's "no setState directly in an effect body" rule is
  // satisfied; the actual transition is driven by an external trigger
  // (the user flipping target lang in the settings drawer).
  useEffect(() => {
    dispatchedRef.current = new Set();
    queueMicrotask(() => {
      setLines([]);
    });
  }, [targetLang, provider]);

  useEffect(() => {
    const pending: TranscriptEntry[] = [];
    for (const entry of transcripts) {
      if (entry.role !== "assistant") continue;
      if (!entry.done) continue;
      if (entry.text.trim().length === 0) continue;
      if (dispatchedRef.current.has(entry.id)) continue;
      pending.push(entry);
    }
    if (pending.length === 0) return;

    // Mark up-front so the next render cycle doesn't re-dispatch.
    for (const entry of pending) dispatchedRef.current.add(entry.id);

    let cancelled = false;

    // Seed each pending entry as a "pending" line so users see the
    // banner reacting immediately. Schedule the state mutation in a
    // microtask — same rationale as in `settings-context.tsx`: the
    // transition is driven by a non-React event source (the realtime
    // transcript stream).
    queueMicrotask(() => {
      if (cancelled) return;
      setLines((prev) => {
        const next = [...prev];
        for (const entry of pending) {
          next.push({
            id: entry.id,
            original: entry.text,
            translated: "",
            ts: Date.now(),
            pending: true,
          });
        }
        return next.slice(-Math.max(maxLines * 2, maxLines + 2));
      });
    });

    (async () => {
      for (const entry of pending) {
        try {
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: entry.text,
              targetLang,
              provider,
            }),
          });
          if (!res.ok) {
            // Don't surface upstream errors to the user — just drop the
            // line. The console message helps during dev.
            console.warn("translate failed", res.status, await res.text());
            if (cancelled) return;
            setLines((prev) => prev.filter((l) => l.id !== entry.id));
            continue;
          }
          const data = (await res.json()) as {
            translation?: string;
            cached?: boolean;
          };
          if (cancelled) return;
          if (!data.translation) {
            setLines((prev) => prev.filter((l) => l.id !== entry.id));
            continue;
          }
          setLines((prev) =>
            prev.map((l) =>
              l.id === entry.id
                ? { ...l, translated: data.translation ?? "", pending: false }
                : l,
            ),
          );
        } catch (err) {
          console.warn("translate threw", err);
          if (cancelled) return;
          setLines((prev) => prev.filter((l) => l.id !== entry.id));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [transcripts, provider, targetLang, maxLines]);

  // Visible slice: the last `maxLines` lines with oldest faded.
  const visible = useMemo(() => lines.slice(-maxLines), [lines, maxLines]);

  if (visible.length === 0) return null;

  return (
    <div
      // Sticky bottom banner. `pointer-events-none` keeps it from
      // blocking clicks on the transcript / end-interview button —
      // the overlay is purely informational. We position it inside the
      // viewport so the transcript stream above isn't pushed up.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-full max-w-3xl space-y-1.5 rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
            Translation · {targetLang.toUpperCase()}
          </span>
          <span className="text-[10px] text-neutral-400">
            via {provider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash-lite"}
          </span>
        </div>
        <ul className="space-y-1">
          {visible.map((line, idx) => {
            const isOldest = idx === 0 && visible.length === maxLines;
            return (
              <li
                key={line.id}
                className={[
                  "text-sm leading-snug text-neutral-800 dark:text-neutral-100",
                  isOldest ? "opacity-60" : "opacity-100",
                ].join(" ")}
              >
                {line.pending ? (
                  <span className="text-neutral-400 italic">translating…</span>
                ) : (
                  line.translated
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
