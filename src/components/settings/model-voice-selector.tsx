"use client";

import { useSettings } from "@/lib/settings/settings-context";
import {
  MODELS_BY_PROVIDER,
  VOICES_BY_PROVIDER,
} from "@/lib/settings/model-options";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ModelVoiceSelector() {
  const { settings, setModel, setVoice } = useSettings();
  const models = MODELS_BY_PROVIDER[settings.providerId];
  const voices = VOICES_BY_PROVIDER[settings.providerId];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-1.5">
        <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          Model
        </label>
        <Select value={settings.model} onValueChange={setModel}>
          <SelectTrigger className="min-w-0 [&>span]:block [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
                {m.hint ? (
                  <span className="ml-1 text-xs text-neutral-500">
                    · {m.hint}
                  </span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-0 space-y-1.5">
        <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          Voice
        </label>
        <Select value={settings.voice} onValueChange={setVoice}>
          <SelectTrigger className="min-w-0 [&>span]:block [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left">
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
    </div>
  );
}
