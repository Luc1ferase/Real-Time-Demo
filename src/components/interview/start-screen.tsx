"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProviderId, ReasoningEffort } from "@/lib/realtime/types";
import type {
  Difficulty,
  JobTrack,
} from "@/lib/realtime/interview-instructions";
import {
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_VOICE_BY_PROVIDER,
  MODELS_BY_PROVIDER,
  VOICES_BY_PROVIDER,
  REASONING_EFFORT_OPTIONS,
  modelSupportsReasoningEffort,
} from "@/lib/settings/model-options";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/lib/settings/settings-context";

export interface StartScreenSelection {
  providerId: ProviderId;
  job: JobTrack;
  difficulty: Difficulty;
  /** Per-session override of the provider's model. Defaults to settings.model. */
  model: string;
  /** Per-session override of the provider's voice. Defaults to settings.voice. */
  voice: string;
  /** Per-session override of reasoning effort. Only honored on gpt-realtime-2. */
  reasoningEffort: ReasoningEffort;
}

interface StartScreenProps {
  selection: StartScreenSelection;
  onChange(next: StartScreenSelection): void;
  onStart(): void;
  /** True when we're currently dialing the provider — disables the form. */
  busy?: boolean;
  /**
   * Caller hook so the "Save as default" link opens the settings drawer
   * (with the current per-session values already written back via
   * settings context — see `InterviewClient`).
   */
  onOpenSettings?: () => void;
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
  onOpenSettings,
}: StartScreenProps) {
  const { setSettings, settings } = useSettings();
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Whenever the provider changes, reset model + voice on the active
  // selection to that provider's defaults. The caller may also pass us a
  // selection that drifted — clamp here so the <Select> doesn't render
  // an out-of-list value.
  useEffect(() => {
    const validModels = MODELS_BY_PROVIDER[selection.providerId].map(
      (m) => m.id,
    );
    const validVoices = VOICES_BY_PROVIDER[selection.providerId].map(
      (v) => v.id,
    );
    if (
      !validModels.includes(selection.model) ||
      !validVoices.includes(selection.voice)
    ) {
      onChange({
        ...selection,
        model: validModels.includes(selection.model)
          ? selection.model
          : DEFAULT_MODEL_BY_PROVIDER[selection.providerId],
        voice: validVoices.includes(selection.voice)
          ? selection.voice
          : DEFAULT_VOICE_BY_PROVIDER[selection.providerId],
      });
    }
  }, [selection, onChange]);

  const models = MODELS_BY_PROVIDER[selection.providerId];
  const voices = VOICES_BY_PROVIDER[selection.providerId];
  const showEffort =
    selection.providerId === "openai" &&
    modelSupportsReasoningEffort(selection.model);

  // True when at least one of the per-session overrides differs from the
  // settings defaults. Toggles the "Save as default" link.
  const overridesDefaults =
    selection.providerId !== settings.providerId ||
    selection.model !== settings.model ||
    selection.voice !== settings.voice ||
    selection.reasoningEffort !== settings.reasoningEffort;

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
          onChange={(id) =>
            onChange({
              ...selection,
              providerId: id,
              // Switching providers must reset model + voice — they are
              // provider-scoped and an OpenAI voice would 400 against
              // Gemini's session config (and vice versa).
              model: DEFAULT_MODEL_BY_PROVIDER[id],
              voice: DEFAULT_VOICE_BY_PROVIDER[id],
            })
          }
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

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            disabled={busy}
            className="text-xs font-medium text-neutral-500 underline-offset-4 hover:underline disabled:opacity-50"
          >
            {showAdvanced ? "Hide" : "Show"} model & voice
          </button>
          {showAdvanced ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  Model
                </label>
                <Select
                  value={selection.model}
                  onValueChange={(v) => onChange({ ...selection, model: v })}
                  disabled={busy}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  Voice
                </label>
                <Select
                  value={selection.voice}
                  onValueChange={(v) => onChange({ ...selection, voice: v })}
                  disabled={busy}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {showEffort ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    Reasoning effort (flagship only)
                  </label>
                  <Select
                    value={selection.reasoningEffort}
                    onValueChange={(v) =>
                      onChange({
                        ...selection,
                        reasoningEffort: v as ReasoningEffort,
                      })
                    }
                    disabled={busy}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REASONING_EFFORT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-xs text-neutral-500">
            Microphone permission is required. The interview auto-ends after
            10 min idle or 60 min total.
          </p>
          <div className="flex items-center gap-3">
            {overridesDefaults ? (
              <button
                type="button"
                onClick={() => {
                  setSettings({
                    providerId: selection.providerId,
                    model: selection.model,
                    voice: selection.voice,
                    reasoningEffort: selection.reasoningEffort,
                    translation: settings.translation,
                  });
                  onOpenSettings?.();
                }}
                disabled={busy}
                className="text-xs font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800 disabled:opacity-50 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                Save as default
              </button>
            ) : null}
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
      </div>
    </section>
  );
}
