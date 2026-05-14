"use client";

import {
  useReasoningEffortVisible,
  useSettings,
} from "@/lib/settings/settings-context";
import { REASONING_EFFORT_OPTIONS } from "@/lib/settings/model-options";
import type { ReasoningEffort } from "@/lib/settings/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Renders only when the active model accepts `reasoning.effort` (currently
 * only `gpt-realtime-2`). Returning null prevents the field from leaking
 * into the form for Gemini / non-flagship OpenAI models.
 */
export function ReasoningEffortSelector() {
  const visible = useReasoningEffortVisible();
  const { settings, setReasoningEffort } = useSettings();

  if (!visible) return null;

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
        Reasoning effort
      </label>
      <Select
        value={settings.reasoningEffort}
        onValueChange={(v) => setReasoningEffort(v as ReasoningEffort)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REASONING_EFFORT_OPTIONS.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              {opt.label}
              {opt.hint ? (
                <span className="ml-1 text-xs text-neutral-500">
                  · {opt.hint}
                </span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-neutral-500">
        Flagship-only knob. Maps to{" "}
        <code className="font-mono text-[10px]">reasoning.effort</code> in
        the OpenAI session config.
      </p>
    </div>
  );
}
