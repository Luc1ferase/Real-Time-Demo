"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES, type LanguageCode } from "@/lib/translator/languages";

/**
 * Reusable language picker that drops a "(Auto-detect)" sentinel when
 * `allowAuto` is true (i.e. the source-language picker). Target uses
 * the same component without the sentinel.
 */
interface LanguagePickerProps {
  label: string;
  value: LanguageCode | "auto";
  onChange(next: LanguageCode | "auto"): void;
  allowAuto?: boolean;
  disabled?: boolean;
}

export function LanguagePicker({
  label,
  value,
  onChange,
  allowAuto,
  disabled,
}: LanguagePickerProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
        {label}
      </label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as LanguageCode | "auto")}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowAuto ? (
            <SelectItem value="auto">Auto-detect</SelectItem>
          ) : null}
          {LANGUAGES.map((l) => (
            <SelectItem key={l.code} value={l.code}>
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
