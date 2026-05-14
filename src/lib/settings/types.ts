import type { ProviderId, ReasoningEffort } from "@/lib/realtime/types";

/**
 * Re-export the canonical `ReasoningEffort` union from the realtime
 * types module so consumers that only depend on settings still get a
 * single source of truth.
 */
export type { ReasoningEffort };

/** Languages offered in the translation overlay target picker. */
export type TranslationTargetLang = "zh" | "en" | "ja" | "es" | "fr";

export interface TranslationSettings {
  /** When false, the overlay is unmounted and no /api/translate calls fire. */
  enabled: boolean;
  /** Target language the overlay translates assistant turns into. */
  targetLang: TranslationTargetLang;
}

/**
 * Global user-facing defaults persisted to localStorage. The start screen
 * may override `providerId` / `model` / `voice` / `reasoningEffort` for a
 * single interview without mutating these defaults; the overlay toggle
 * always reads from here so it can be flipped mid-session.
 */
export interface AppSettings {
  providerId: ProviderId;
  /**
   * Model id for the active provider. Stored as a single string (not
   * keyed by provider) — switching providers swaps this to the matching
   * provider default via `setProvider`.
   */
  model: string;
  voice: string;
  reasoningEffort: ReasoningEffort;
  translation: TranslationSettings;
}
