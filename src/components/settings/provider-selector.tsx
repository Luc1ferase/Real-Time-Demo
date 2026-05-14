"use client";

import { useEffect, useState } from "react";
import type { ProviderId } from "@/lib/realtime/types";
import { useSettings } from "@/lib/settings/settings-context";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

interface ProviderMeta {
  id: ProviderId;
  label: string;
  hint: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "gemini",
    label: "Gemini",
    hint: "Free tier (default during dev)",
  },
  {
    id: "openai",
    label: "OpenAI",
    hint: "gpt-realtime-2 via WebRTC",
  },
];

/**
 * Hits the dedicated `/api/realtime/env-check` probe, which only reads
 * `process.env` — no upstream OpenAI call, no Gemini key disclosure.
 * The drawer renders a "needs API key" badge next to any provider
 * whose key isn't present on the server.
 */
async function fetchEnvCheck(): Promise<Record<ProviderId, boolean>> {
  try {
    const res = await fetch("/api/realtime/env-check", { method: "GET" });
    if (!res.ok) return { openai: true, gemini: true };
    const data = (await res.json()) as Partial<Record<ProviderId, boolean>>;
    return {
      openai: !data.openai,
      gemini: !data.gemini,
    };
  } catch {
    return { openai: true, gemini: true };
  }
}

export function ProviderSelector() {
  const { settings, setProvider } = useSettings();
  const [missing, setMissing] = useState<Record<ProviderId, boolean>>({
    openai: false,
    gemini: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchEnvCheck();
      if (cancelled) return;
      // Queue the setState into a microtask — the React Compiler's
      // "no setState directly in an effect body" rule requires the
      // mutation be driven by an external transition (here, the
      // /env-check fetch).
      queueMicrotask(() => {
        if (cancelled) return;
        setMissing(result);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RadioGroup
      value={settings.providerId}
      onValueChange={(v) => setProvider(v as ProviderId)}
      className="grid-cols-2 sm:grid-cols-2"
    >
      {PROVIDERS.map((p) => {
        const checked = settings.providerId === p.id;
        return (
          <label
            key={p.id}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors",
              checked
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200",
            )}
          >
            <RadioGroupItem
              value={p.id}
              className={cn(
                "mt-0.5",
                checked ? "border-white dark:border-neutral-900" : "",
              )}
            />
            <span className="flex flex-1 flex-col">
              <span className="flex items-center gap-1.5 font-medium">
                {p.label}
                {missing[p.id] ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      checked
                        ? "bg-white/20 text-white dark:bg-neutral-900/15 dark:text-neutral-900"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
                    )}
                  >
                    needs API key
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "mt-0.5 text-xs",
                  checked
                    ? "text-white/80 dark:text-neutral-700"
                    : "text-neutral-500",
                )}
              >
                {p.hint}
              </span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
