"use client";

import { useSettings } from "@/lib/settings/settings-context";
import { TRANSLATION_TARGET_LANGS } from "@/lib/settings/model-options";
import type { TranslationTargetLang } from "@/lib/settings/types";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TranslationToggle() {
  const { settings, setTranslation } = useSettings();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <label
            htmlFor="translation-overlay"
            className="text-sm font-medium text-neutral-800 dark:text-neutral-100"
          >
            Translation overlay
          </label>
          <span className="text-xs text-neutral-500">
            Subtitle every interviewer reply with a translation.
          </span>
        </div>
        <Switch
          id="translation-overlay"
          checked={settings.translation.enabled}
          onCheckedChange={(checked) =>
            setTranslation({ enabled: Boolean(checked) })
          }
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          Target language
        </label>
        <Select
          value={settings.translation.targetLang}
          onValueChange={(v) =>
            setTranslation({ targetLang: v as TranslationTargetLang })
          }
          disabled={!settings.translation.enabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSLATION_TARGET_LANGS.map((lang) => (
              <SelectItem key={lang.id} value={lang.id}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
