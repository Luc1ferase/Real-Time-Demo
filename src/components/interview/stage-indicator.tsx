"use client";

import {
  INTERVIEW_STAGES,
  type InterviewStage,
} from "@/lib/realtime/interview-instructions";

const STAGE_LABEL: Record<InterviewStage, string> = {
  warmup: "Warm-up",
  technical: "Technical",
  behavioral: "Behavioral",
  feedback: "Feedback",
};

export function StageIndicator({ current }: { current: InterviewStage }) {
  const currentIndex = INTERVIEW_STAGES.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs">
      {INTERVIEW_STAGES.map((stage, idx) => {
        const state =
          idx < currentIndex
            ? "done"
            : idx === currentIndex
              ? "active"
              : "pending";
        return (
          <li key={stage} className="flex items-center gap-1.5">
            <span
              className={[
                "rounded-full px-2 py-0.5 font-medium",
                state === "active"
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : state === "done"
                    ? "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    : "bg-transparent text-neutral-400 ring-1 ring-inset ring-neutral-200 dark:ring-neutral-800",
              ].join(" ")}
            >
              {STAGE_LABEL[stage]}
            </span>
            {idx < INTERVIEW_STAGES.length - 1 ? (
              <span className="text-neutral-300 dark:text-neutral-700">→</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
