import type { AppSettings } from "./types";
import {
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_VOICE_BY_PROVIDER,
} from "./model-options";

/**
 * The shape rendered on first paint before localStorage hydration. PR3 hard-
 * coded a `(gemini, fullstack, medium)` default on the start screen; here we
 * only own the provider/model/voice/effort/translation slice — `job` and
 * `difficulty` remain per-interview start-screen state.
 *
 * Gemini is the default because the demo's free-tier path lives there until
 * OpenAI billing is configured.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  providerId: "gemini",
  model: DEFAULT_MODEL_BY_PROVIDER.gemini,
  voice: DEFAULT_VOICE_BY_PROVIDER.gemini,
  reasoningEffort: "medium",
  translation: {
    enabled: false,
    targetLang: "zh",
  },
};
