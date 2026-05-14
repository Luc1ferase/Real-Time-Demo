"use client";

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { InterviewHistoryEntry } from "@/lib/history/types";
import type { ScorecardPayload } from "@/lib/realtime/interview-tools";

interface HistoryDetailProps {
  entry: InterviewHistoryEntry;
  onClose(): void;
}

function formatClock(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatDelta(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const DIM_LABEL: Record<keyof Omit<ScorecardPayload, "summary">, string> = {
  communication: "Communication",
  technical_depth: "Technical depth",
  structured_thinking: "Structured thinking",
};

function ScoreBar({ score }: { score: number }) {
  const pct = (Math.max(0, Math.min(5, score)) / 5) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
      <div
        className="h-full rounded-full bg-emerald-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ScorecardBlock({ scorecard }: { scorecard: ScorecardPayload }) {
  const dimensions: (keyof Omit<ScorecardPayload, "summary">)[] = [
    "communication",
    "technical_depth",
    "structured_thinking",
  ];
  return (
    <article className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
        Scorecard
      </h3>
      <dl className="space-y-3.5">
        {dimensions.map((dim) => (
          <div key={dim} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <dt className="font-medium text-neutral-700 dark:text-neutral-200">
                {DIM_LABEL[dim]}
              </dt>
              <dd className="font-mono text-neutral-900 dark:text-neutral-100">
                {scorecard[dim]} / 5
              </dd>
            </div>
            <ScoreBar score={scorecard[dim]} />
          </div>
        ))}
      </dl>
      <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <h4 className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Summary
        </h4>
        <p className="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">
          {scorecard.summary}
        </p>
      </div>
    </article>
  );
}

export function HistoryDetail({ entry, onClose }: HistoryDetailProps) {
  return (
    <Sheet
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Interview transcript</SheetTitle>
          <SheetDescription>
            {formatClock(entry.startedAt)} · {entry.jobType} ·{" "}
            {entry.difficulty} · {entry.provider}/{entry.model}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5">
          {entry.scorecard ? (
            <ScorecardBlock scorecard={entry.scorecard} />
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-3 text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900">
              No scorecard recorded — the interview ended before the feedback
              stage.
            </div>
          )}

          <article className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">
              Transcript
            </h3>
            {entry.transcripts.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No transcripts were captured for this session.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {entry.transcripts.map((t, idx) => (
                  <li
                    key={`${entry.id}-${idx}`}
                    className={[
                      "flex flex-col gap-1 rounded-xl px-3 py-2",
                      t.role === "user"
                        ? "bg-neutral-100 dark:bg-neutral-800"
                        : "bg-emerald-50 dark:bg-emerald-950/40",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
                      <span>{t.role === "user" ? "You" : "Interviewer"}</span>
                      <span className="font-mono">{formatDelta(t.ts)}</span>
                    </div>
                    <span className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-100">
                      {t.text}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </article>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
