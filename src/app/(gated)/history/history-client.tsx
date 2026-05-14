"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useInterviewHistory } from "@/lib/history/use-interview-history";
import type { InterviewHistoryEntry } from "@/lib/history/types";
import { HistoryDetail } from "./history-detail";

/**
 * Inline "X ago" formatter so the bundle doesn't pull in date-fns / dayjs
 * for one screen. Returns the most informative unit only ("12m ago",
 * "3h ago", "2d ago"). Sub-minute is "just now". `now=0` means the
 * mount-time effect hasn't ticked yet — render a placeholder so SSR /
 * first-paint don't claim "just now" for old sessions.
 */
function relativeTime(ts: number, now: number): string {
  if (now === 0) return "—";
  const delta = Math.max(0, now - ts);
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

const PROVIDER_LABEL: Record<InterviewHistoryEntry["provider"], string> = {
  openai: "OpenAI",
  gemini: "Gemini",
};

const JOB_LABEL: Record<InterviewHistoryEntry["jobType"], string> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Full-Stack",
};

const DIFFICULTY_LABEL: Record<InterviewHistoryEntry["difficulty"], string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const END_REASON_LABEL: Record<InterviewHistoryEntry["endReason"], string> = {
  completed: "Completed",
  ended_early: "Ended early",
  timeout: "Timed out",
  error: "Error",
};

function scorecardAverage(entry: InterviewHistoryEntry): number | null {
  if (!entry.scorecard) return null;
  const { communication, technical_depth, structured_thinking } =
    entry.scorecard;
  return (communication + technical_depth + structured_thinking) / 3;
}

interface HistoryRowProps {
  entry: InterviewHistoryEntry;
  now: number;
  onOpen(): void;
  onDelete(): void;
}

function HistoryRow({ entry, now, onOpen, onDelete }: HistoryRowProps) {
  const avg = scorecardAverage(entry);
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-neutral-800 dark:text-neutral-100">
              {JOB_LABEL[entry.jobType]} · {DIFFICULTY_LABEL[entry.difficulty]}
            </span>
            <span className="text-neutral-400">·</span>
            <span className="text-neutral-500">
              {PROVIDER_LABEL[entry.provider]} / {entry.model}
            </span>
            <span className="text-neutral-400">·</span>
            <span className="text-neutral-500">voice {entry.voice}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span>{relativeTime(entry.startedAt, now)}</span>
            <span className="text-neutral-400">·</span>
            <span>{formatDuration(entry.durationMs)}</span>
            <span className="text-neutral-400">·</span>
            <span
              className={[
                "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                entry.endReason === "completed"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : entry.endReason === "error"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                    : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
              ].join(" ")}
            >
              {END_REASON_LABEL[entry.endReason]}
            </span>
            {avg !== null ? (
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
                avg {avg.toFixed(1)}/5
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                no scorecard
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onOpen}>
            Open
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onDelete}
          >
            Delete
          </Button>
        </div>
      </div>
    </article>
  );
}

export function HistoryClient() {
  const { entries, hydrated, remove, clear } = useInterviewHistory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // `now` drives the relative-time labels. We tick it once a minute so
  // labels stay roughly current without re-rendering aggressively, and
  // we don't read `Date.now()` during render (React Compiler purity
  // rule). Initial value is 0 — relativeTime tolerates `delta < 0` by
  // clamping, and the first effect tick lands within the same frame.
  const [now, setNow] = useState(0);
  useEffect(() => {
    // queueMicrotask defers the initial setState out of the effect body
    // so the React Compiler's "no setState directly in an effect" rule
    // is satisfied (same pattern as `SettingsProvider`'s hydration).
    queueMicrotask(() => setNow(Date.now()));
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const selected = selectedId
    ? (entries.find((e) => e.id === selectedId) ?? null)
    : null;

  const handleDelete = (id: string) => {
    remove(id);
    if (selectedId === id) setSelectedId(null);
  };

  const handleClearAll = () => {
    clear();
    setSelectedId(null);
    setConfirmClear(false);
  };

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5 px-6 py-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
          Local history
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Past interviews
          </h1>
          {entries.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmClear(true)}
            >
              Clear all
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Stored in this browser only ({entries.length} of 20 saved). Nothing
          is sent to any backend.
        </p>
      </header>

      {!hydrated ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900">
          Loading…
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            No interviews recorded yet.
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Your transcripts and scorecards will land here after each
            session.
          </p>
          <Button asChild className="mt-5">
            <Link href="/interview">Start a new interview →</Link>
          </Button>
        </div>
      ) : (
        <ol className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <HistoryRow
                entry={entry}
                now={now}
                onOpen={() => setSelectedId(entry.id)}
                onDelete={() => handleDelete(entry.id)}
              />
            </li>
          ))}
        </ol>
      )}

      {selected ? (
        <HistoryDetail
          entry={selected}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {confirmClear ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmClear(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-lg font-semibold">Clear all history?</h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              This deletes every interview transcript and scorecard stored in
              this browser. The action can&apos;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmClear(false)}
              >
                Keep
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleClearAll}
              >
                Clear all
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
