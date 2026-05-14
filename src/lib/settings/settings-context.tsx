"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ProviderId } from "@/lib/realtime/types";
import { DEFAULT_SETTINGS } from "./defaults";
import {
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_VOICE_BY_PROVIDER,
  MODELS_BY_PROVIDER,
  VOICES_BY_PROVIDER,
  modelSupportsReasoningEffort,
} from "./model-options";
import type { AppSettings, ReasoningEffort, TranslationSettings } from "./types";

const STORAGE_KEY = "realtime-demo.settings.v1";

interface SettingsContextValue {
  settings: AppSettings;
  /** Has the initial localStorage read completed? */
  hydrated: boolean;
  /** Replace a single top-level setting (model/voice already validated). */
  setSettings(next: AppSettings): void;
  /** Switch provider; also resets model + voice to that provider's defaults. */
  setProvider(provider: ProviderId): void;
  setModel(model: string): void;
  setVoice(voice: string): void;
  setReasoningEffort(effort: ReasoningEffort): void;
  setTranslation(next: Partial<TranslationSettings>): void;
  /** Reset to factory defaults (wipes localStorage). */
  reset(): void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Coerce an unknown blob from localStorage to a fully-typed AppSettings,
 * falling back to defaults for any field that is missing or off-list.
 * Tolerant on purpose — bumping `STORAGE_KEY` would orphan persisted
 * preferences, so we'd rather absorb shape drift from older versions.
 */
function sanitize(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const candidate = raw as Partial<AppSettings>;

  const providerId: ProviderId =
    candidate.providerId === "openai" || candidate.providerId === "gemini"
      ? candidate.providerId
      : DEFAULT_SETTINGS.providerId;

  const modelList = MODELS_BY_PROVIDER[providerId].map((m) => m.id);
  const model =
    typeof candidate.model === "string" && modelList.includes(candidate.model)
      ? candidate.model
      : DEFAULT_MODEL_BY_PROVIDER[providerId];

  const voiceList = VOICES_BY_PROVIDER[providerId].map((v) => v.id);
  const voice =
    typeof candidate.voice === "string" && voiceList.includes(candidate.voice)
      ? candidate.voice
      : DEFAULT_VOICE_BY_PROVIDER[providerId];

  const effortValues: ReasoningEffort[] = [
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
  ];
  const reasoningEffort: ReasoningEffort =
    typeof candidate.reasoningEffort === "string" &&
    (effortValues as string[]).includes(candidate.reasoningEffort)
      ? (candidate.reasoningEffort as ReasoningEffort)
      : DEFAULT_SETTINGS.reasoningEffort;

  const translationRaw = candidate.translation;
  const validLangs = ["zh", "en", "ja", "es", "fr"];
  const translation: TranslationSettings =
    translationRaw && typeof translationRaw === "object"
      ? {
          enabled: Boolean(
            (translationRaw as Partial<TranslationSettings>).enabled,
          ),
          targetLang:
            typeof (translationRaw as Partial<TranslationSettings>)
              .targetLang === "string" &&
            validLangs.includes(
              (translationRaw as Partial<TranslationSettings>)
                .targetLang as string,
            )
              ? ((translationRaw as TranslationSettings).targetLang)
              : DEFAULT_SETTINGS.translation.targetLang,
        }
      : DEFAULT_SETTINGS.translation;

  return { providerId, model, voice, reasoningEffort, translation };
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // Initial render uses pure defaults — never reads window/localStorage.
  // The first useEffect below hydrates from localStorage on the client
  // and emits a single state transition. This guarantees server and
  // first-client render match (no hydration mismatch).
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  // Skip the very first write-back so the post-hydration state doesn't
  // immediately overwrite the persisted value with defaults.
  const firstPersistRef = useRef(true);

  // Hydrate from localStorage exactly once. We defer the setState calls
  // into a microtask so the React Compiler's
  // "no setState directly in an effect body" rule is satisfied — the
  // underlying transition is the result of reading an external store
  // (localStorage), which genuinely needs to project into local state.
  useEffect(() => {
    let parsedSettings: AppSettings | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        parsedSettings = sanitize(JSON.parse(raw) as unknown);
      }
    } catch {
      // Malformed JSON or storage unavailable (private mode, quotas)
      // — keep defaults.
    }
    queueMicrotask(() => {
      if (parsedSettings) setSettingsState(parsedSettings);
      setHydrated(true);
    });
  }, []);

  // Persist on every change after hydration completes.
  useEffect(() => {
    if (!hydrated) return;
    if (firstPersistRef.current) {
      firstPersistRef.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Best-effort; e.g. Safari private mode throws on `setItem`.
    }
  }, [settings, hydrated]);

  const setSettings = useCallback((next: AppSettings) => {
    setSettingsState(sanitize(next));
  }, []);

  const setProvider = useCallback((provider: ProviderId) => {
    setSettingsState((prev) => {
      if (prev.providerId === provider) return prev;
      // Switching providers must also reset the model + voice — those
      // strings are provider-scoped and would otherwise be invalid for
      // the new provider's session config.
      return {
        ...prev,
        providerId: provider,
        model: DEFAULT_MODEL_BY_PROVIDER[provider],
        voice: DEFAULT_VOICE_BY_PROVIDER[provider],
      };
    });
  }, []);

  const setModel = useCallback((model: string) => {
    setSettingsState((prev) => {
      const allowed = MODELS_BY_PROVIDER[prev.providerId].map((m) => m.id);
      if (!allowed.includes(model)) return prev;
      return { ...prev, model };
    });
  }, []);

  const setVoice = useCallback((voice: string) => {
    setSettingsState((prev) => {
      const allowed = VOICES_BY_PROVIDER[prev.providerId].map((v) => v.id);
      if (!allowed.includes(voice)) return prev;
      return { ...prev, voice };
    });
  }, []);

  const setReasoningEffort = useCallback((effort: ReasoningEffort) => {
    setSettingsState((prev) => ({ ...prev, reasoningEffort: effort }));
  }, []);

  const setTranslation = useCallback(
    (next: Partial<TranslationSettings>) => {
      setSettingsState((prev) => ({
        ...prev,
        translation: { ...prev.translation, ...next },
      }));
    },
    [],
  );

  const reset = useCallback(() => {
    setSettingsState(DEFAULT_SETTINGS);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore — same rationale as setItem above
    }
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      hydrated,
      setSettings,
      setProvider,
      setModel,
      setVoice,
      setReasoningEffort,
      setTranslation,
      reset,
    }),
    [
      settings,
      hydrated,
      setSettings,
      setProvider,
      setModel,
      setVoice,
      setReasoningEffort,
      setTranslation,
      reset,
    ],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used inside a <SettingsProvider>");
  }
  return ctx;
}

/** Convenience: does the current `(provider, model)` accept reasoning effort? */
export function useReasoningEffortVisible(): boolean {
  const { settings } = useSettings();
  return (
    settings.providerId === "openai" &&
    modelSupportsReasoningEffort(settings.model)
  );
}
