"use client";

import { Button } from "@/components/ui/button";
import type { ScorecardPayload } from "@/lib/realtime/interview-tools";

const DIMENSION_LABEL: Record<keyof Omit<ScorecardPayload, "summary">, string> =
  {
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

export function Scorecard({
  scorecard,
  onRestart,
}: {
  scorecard: ScorecardPayload;
  onRestart(): void;
}) {
  const dimensions: (keyof Omit<ScorecardPayload, "summary">)[] = [
    "communication",
    "technical_depth",
    "structured_thinking",
  ];

  return (
    <section className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
          Interview complete
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Scorecard</h1>
      </header>

      <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <dl className="space-y-5">
          {dimensions.map((dim) => (
            <div key={dim} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <dt className="font-medium text-neutral-700 dark:text-neutral-200">
                  {DIMENSION_LABEL[dim]}
                </dt>
                <dd className="font-mono text-neutral-900 dark:text-neutral-100">
                  {scorecard[dim]} / 5
                </dd>
              </div>
              <ScoreBar score={scorecard[dim]} />
            </div>
          ))}
        </dl>

        <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Summary
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            {scorecard.summary}
          </p>
        </div>
      </article>

      <div className="flex justify-end">
        <Button type="button" size="lg" onClick={onRestart}>
          Start another interview
        </Button>
      </div>
    </section>
  );
}
