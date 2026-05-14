/**
 * Opinionated language list for the /translator route.
 *
 * OpenAI's `gpt-realtime-translate` supports 70+ source languages
 * (auto-detected) and 13 output languages. We expose 8 — enough to
 * cover the demo's interview audience without overwhelming the UI.
 * PR6 may grow this list.
 *
 * Source-language codes flow into `audio.input.transcription.language`
 * (a whisper hint) when the user picks a specific language. Target
 * codes flow into `audio.output.language` and drive the actual
 * translation.
 */

export type LanguageCode = "en" | "zh" | "es" | "ja" | "fr" | "de" | "ko" | "pt";

export interface LanguageOption {
  code: LanguageCode;
  /** Native display name + English label, e.g. "中文 (Chinese)". */
  label: string;
}

/**
 * Order chosen by likely-utility for a US-remote-interview audience:
 * English first (most-translated-to target), Chinese second
 * (translator's primary "tell my story in English" use case), then
 * the rest of the big-13 in rough population order.
 */
export const LANGUAGES: ReadonlyArray<LanguageOption> = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文 (Chinese)" },
  { code: "es", label: "Español (Spanish)" },
  { code: "ja", label: "日本語 (Japanese)" },
  { code: "fr", label: "Français (French)" },
  { code: "de", label: "Deutsch (German)" },
  { code: "ko", label: "한국어 (Korean)" },
  { code: "pt", label: "Português (Portuguese)" },
];

export const LANGUAGE_CODES: ReadonlyArray<LanguageCode> = LANGUAGES.map(
  (l) => l.code,
);

export function isLanguageCode(value: unknown): value is LanguageCode {
  return (
    typeof value === "string" &&
    (LANGUAGE_CODES as ReadonlyArray<string>).includes(value)
  );
}

export function labelFor(code: LanguageCode): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
