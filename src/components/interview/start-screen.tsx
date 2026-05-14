"use client";

import { Button } from "@/components/ui/button";
import type { ProviderId } from "@/lib/realtime/types";
import type {
  Difficulty,
  JobTrack,
} from "@/lib/realtime/interview-instructions";

export interface StartScreenSelection {
  providerId: ProviderId;
  job: JobTrack;
  difficulty: Difficulty;
}

interface StartScreenProps {
  selection: StartScreenSelection;
  onChange(next: StartScreenSelection): void;
  onStart(): void;
  /** True when we're currently dialing the provider — disables the form. */
  busy?: boolean;
}

const PROVIDERS: { id: ProviderId; label: string; hint: string }[] = [
  {
    id: "gemini",
    label: "Gemini",
    hint: "Free tier (default while OpenAI billing is offline)",
  },
  {
    id: "openai",
    label: "OpenAI",
    hint: "gpt-realtime-2 via WebRTC",
  },
];

const JOBS: { id: JobTrack; label: string }[] = [
  { id: "frontend", label: "Frontend Engineer" },
  { id: "backend", label: "Backend Engineer" },
  { id: "fullstack", label: "Full-Stack Engineer" },
];

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "Easy (junior)" },
  { id: "medium", label: "Medium (mid)" },
  { id: "hard", label: "Hard (senior)" },
];

function RadioGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  options: { id: T; label: string; hint?: string }[];
  value: T;
  onChange(next: T): void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
        {legend}
      </legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <label
              key={opt.id}
              className={[
                "cursor-pointer rounded-xl border px-3 py-2.5 text-sm transition-colors",
                active
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600",
                disabled ? "cursor-not-allowed opacity-60" : "",
              ].join(" ")}
            >
              <input
                type="radio"
                name={legend}
                value={opt.id}
                checked={active}
                onChange={() => onChange(opt.id)}
                disabled={disabled}
                className="sr-only"
              />
              <span className="block font-medium">{opt.label}</span>
              {opt.hint ? (
                <span
                  className={[
                    "mt-0.5 block text-xs",
                    active
                      ? "text-white/80 dark:text-neutral-700"
                      : "text-neutral-500",
                  ].join(" ")}
                >
                  {opt.hint}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function StartScreen({
  selection,
  onChange,
  onStart,
  busy,
}: StartScreenProps) {
  return (
    <section className="mx-auto w-full max-w-2xl space-y-8 px-6 py-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
          Mode 1 of 2
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          AI Mock Interviewer
        </h1>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          A structured voice interview with stage progression and a final
          scorecard. Pick your provider, role, and difficulty, then start
          talking. You can interrupt the interviewer at any time.
        </p>
      </header>

      <div className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <RadioGroup<ProviderId>
          legend="Provider"
          options={PROVIDERS}
          value={selection.providerId}
          onChange={(id) => onChange({ ...selection, providerId: id })}
          disabled={busy}
        />
        <RadioGroup<JobTrack>
          legend="Role"
          options={JOBS}
          value={selection.job}
          onChange={(id) => onChange({ ...selection, job: id })}
          disabled={busy}
        />
        <RadioGroup<Difficulty>
          legend="Difficulty"
          options={DIFFICULTIES}
          value={selection.difficulty}
          onChange={(id) => onChange({ ...selection, difficulty: id })}
          disabled={busy}
        />

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-neutral-500">
            Microphone permission is required. The interview auto-ends after
            10 min idle or 60 min total.
          </p>
          <Button
            type="button"
            size="lg"
            onClick={onStart}
            disabled={busy}
          >
            {busy ? "Connecting…" : "Start interview"}
          </Button>
        </div>
      </div>
    </section>
  );
}
