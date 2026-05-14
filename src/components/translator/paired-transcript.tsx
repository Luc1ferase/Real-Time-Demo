"use client";

import { useEffect, useRef } from "react";
import type { PairedEntry } from "@/lib/translator/use-translator-session";

interface PairedTranscriptProps {
  entries: PairedEntry[];
  sourceLabel: string;
  targetLabel: string;
}

/**
 * Two-column scrolling list of paired source/translation rows. Source
 * is left-aligned, translation right-aligned (DeepL Live style). We
 * auto-scroll to the bottom whenever the tail entry grows so streaming
 * deltas stay in view.
 */
export function PairedTranscript({
  entries,
  sourceLabel,
  targetLabel,
}: PairedTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tail = entries[entries.length - 1];
  const tailKey = `${tail?.id ?? "_"}:${tail?.sourceText.length ?? 0}:${
    tail?.translatedText.length ?? 0
  }`;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [tailKey]);

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900">
        Speak in {sourceLabel} — translations into {targetLabel} appear
        here.
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="max-h-[28rem] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
          {sourceLabel}
        </div>
        <div className="hidden text-right text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500 sm:block">
          {targetLabel}
        </div>
      </div>
      <ol className="mt-2 space-y-3">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            <div className="rounded-xl bg-neutral-100 px-3 py-2 text-sm text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100">
              {entry.sourceText || (
                <em className="text-neutral-400">
                  (listening…)
                </em>
              )}
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-right text-sm text-neutral-800 dark:bg-emerald-950/40 dark:text-neutral-100">
              {entry.translatedText || (
                <em className="text-neutral-400">
                  (translating…)
                </em>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
