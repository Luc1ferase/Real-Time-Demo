"use client";

import { useEffect, useRef } from "react";
import type { TranscriptEntry } from "@/lib/realtime/types";

export function TranscriptStream({
  entries,
}: {
  entries: TranscriptEntry[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom whenever the transcript grows. We anchor on the
  // entry count + the last entry's text length so deltas also trigger.
  const tailLength = entries[entries.length - 1]?.text.length ?? 0;
  const entryCount = entries.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entryCount, tailLength]);

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900">
        Waiting for the interviewer to greet you…
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="max-h-[28rem] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <ol className="space-y-3">
        {entries
          .filter((entry) => entry.role !== "system")
          .map((entry) => (
            <li
              key={entry.id}
              className={[
                "flex flex-col gap-1 rounded-xl px-3 py-2",
                entry.role === "user"
                  ? "bg-neutral-100 dark:bg-neutral-800"
                  : "bg-emerald-50 dark:bg-emerald-950/40",
              ].join(" ")}
            >
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
                {entry.role === "user" ? "You" : "Interviewer"}
                {!entry.done ? " · streaming" : ""}
              </span>
              <span className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-100">
                {entry.text || (
                  <em className="text-neutral-400">(transcribing…)</em>
                )}
              </span>
            </li>
          ))}
      </ol>
    </div>
  );
}
