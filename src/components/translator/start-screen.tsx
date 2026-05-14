"use client";

import { Button } from "@/components/ui/button";
import { LanguagePicker } from "./language-picker";
import type { LanguageCode } from "@/lib/translator/languages";

export interface TranslatorStartSelection {
  /** Source language hint, or "auto" to let the model decide. */
  sourceLang: LanguageCode | "auto";
  /** Target language is always required — translator must know where to go. */
  targetLang: LanguageCode;
}

interface StartScreenProps {
  selection: TranslatorStartSelection;
  onChange(next: TranslatorStartSelection): void;
  onStart(): void;
  /** True while we're dialing the provider. Disables the form. */
  busy?: boolean;
  /**
   * When the server reports OPENAI_API_KEY is missing the page passes
   * a non-null message; we surface it here and disable Start.
   */
  unavailableMessage?: string | null;
}

export function StartScreen({
  selection,
  onChange,
  onStart,
  busy,
  unavailableMessage,
}: StartScreenProps) {
  const disabled = busy || Boolean(unavailableMessage);

  return (
    <section className="mx-auto w-full max-w-2xl space-y-8 px-6 py-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
          Mode 2 of 2
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Live Translator
        </h1>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Continuous speech-to-speech translation using OpenAI&apos;s
          dedicated <code>gpt-realtime-translate</code> endpoint. Pick
          your source and target languages, then start talking — the
          translator streams audio and subtitles continuously.
        </p>
      </header>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
        <strong className="font-semibold">OpenAI-only.</strong>{" "}
        The translator uses a dedicated translation endpoint that has no
        Gemini equivalent — the provider switcher in the settings drawer
        does not apply on this page.
      </div>

      {unavailableMessage ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          {unavailableMessage}
        </div>
      ) : null}

      <div className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="grid gap-3 sm:grid-cols-2">
          <LanguagePicker
            label="Source language"
            value={selection.sourceLang}
            allowAuto
            onChange={(v) => onChange({ ...selection, sourceLang: v })}
            disabled={disabled}
          />
          <LanguagePicker
            label="Target language"
            value={selection.targetLang}
            onChange={(v) => {
              // Target can never be "auto" — clamp defensively just in
              // case the picker emits it (the picker is configured
              // without `allowAuto`, so this branch is essentially
              // dead, but the typing is permissive).
              if (v === "auto") return;
              onChange({ ...selection, targetLang: v });
            }}
            disabled={disabled}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-neutral-500">
            Microphone permission required. Session auto-ends after 10
            min idle or 60 min total.
          </p>
          <Button
            type="button"
            size="lg"
            onClick={onStart}
            disabled={disabled}
          >
            {busy ? "Connecting…" : "Start translating"}
          </Button>
        </div>
      </div>
    </section>
  );
}
