import type { ProviderId } from "@/lib/realtime/types";
import type { ReasoningEffort, TranslationTargetLang } from "./types";

/**
 * Single source of truth for the model + voice + effort matrices that
 * the settings drawer and the start-screen both render. Keeping these
 * tables here (rather than scattering literals across components) means
 * adding a new provider model / voice is a one-file edit and the typed
 * `ReasoningEffort` union is shared with `AppSettings`.
 */

export interface ModelOption {
  id: string;
  label: string;
  hint?: string;
}

export interface VoiceOption {
  id: string;
  label: string;
}

export const MODELS_BY_PROVIDER: Record<ProviderId, ModelOption[]> = {
  openai: [
    {
      id: "gpt-realtime-2",
      label: "gpt-realtime-2",
      hint: "Flagship · supports reasoning effort",
    },
    { id: "gpt-realtime-1.5", label: "gpt-realtime-1.5" },
    { id: "gpt-realtime", label: "gpt-realtime" },
    { id: "gpt-realtime-mini", label: "gpt-realtime-mini", hint: "Cheapest" },
  ],
  gemini: [
    {
      id: "gemini-3.1-flash-live-preview",
      label: "gemini-3.1-flash-live-preview",
      hint: "Default · free tier",
    },
    {
      id: "gemini-2.5-flash-native-audio-latest",
      label: "gemini-2.5-flash-native-audio-latest",
    },
    {
      id: "gemini-2.5-flash-native-audio-preview-12-2025",
      label: "gemini-2.5-flash-native-audio-preview-12-2025",
    },
  ],
};

export const VOICES_BY_PROVIDER: Record<ProviderId, VoiceOption[]> = {
  openai: [
    { id: "marin", label: "marin" },
    { id: "cedar", label: "cedar" },
    { id: "alloy", label: "alloy" },
    { id: "ash", label: "ash" },
    { id: "ballad", label: "ballad" },
    { id: "coral", label: "coral" },
    { id: "echo", label: "echo" },
    { id: "sage", label: "sage" },
    { id: "shimmer", label: "shimmer" },
    { id: "verse", label: "verse" },
  ],
  gemini: [
    { id: "Puck", label: "Puck" },
    { id: "Charon", label: "Charon" },
    { id: "Kore", label: "Kore" },
    { id: "Fenrir", label: "Fenrir" },
    { id: "Aoede", label: "Aoede" },
  ],
};

export const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  openai: "gpt-realtime-2",
  gemini: "gemini-3.1-flash-live-preview",
};

export const DEFAULT_VOICE_BY_PROVIDER: Record<ProviderId, string> = {
  openai: "marin",
  gemini: "Puck",
};

/**
 * Only `gpt-realtime-2` accepts the `reasoning.effort` knob. Sending it
 * on any other model trips a 400 from `/v1/realtime/client_secrets`.
 */
const REASONING_EFFORT_MODELS: ReadonlySet<string> = new Set([
  "gpt-realtime-2",
]);

export function modelSupportsReasoningEffort(model: string): boolean {
  return REASONING_EFFORT_MODELS.has(model);
}

export const REASONING_EFFORT_OPTIONS: {
  id: ReasoningEffort;
  label: string;
  hint?: string;
}[] = [
  { id: "minimal", label: "Minimal", hint: "Fastest, shallowest" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium", hint: "Default" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extreme", hint: "Slowest, deepest" },
];

export const TRANSLATION_TARGET_LANGS: {
  id: TranslationTargetLang;
  label: string;
}[] = [
  { id: "zh", label: "Chinese (中文)" },
  { id: "en", label: "English" },
  { id: "ja", label: "Japanese (日本語)" },
  { id: "es", label: "Spanish (Español)" },
  { id: "fr", label: "French (Français)" },
];
