"use client";

import * as React from "react";
import { Settings } from "lucide-react";

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings/settings-context";
import { ProviderSelector } from "./provider-selector";
import { ModelVoiceSelector } from "./model-voice-selector";
import { ReasoningEffortSelector } from "./reasoning-effort-selector";
import { TranslationToggle } from "./translation-toggle";

/**
 * Right-side sheet wired to <SettingsContext>. All controls bind directly
 * to the context; closing the sheet does not commit — every change is
 * persisted to localStorage in real time via the post-hydration effect in
 * `settings-context.tsx`.
 *
 * Per the PR4 contract this is intentionally limited to provider / model /
 * voice / effort / overlay. No theme switcher, no advanced tabs.
 */
export function SettingsDrawer({
  open,
  onOpenChange,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /** Optional custom trigger; omit to render the default gear button. */
  trigger?: React.ReactNode;
}) {
  const { reset } = useSettings();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open settings"
          >
            <Settings className="size-4" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Defaults</SheetTitle>
          <SheetDescription>
            These apply to every new interview. The start screen still lets
            you override provider / model / voice / effort for a single run
            without changing the defaults here.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="space-y-6">
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Provider
              </h3>
              <ProviderSelector />
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Model &amp; Voice
              </h3>
              <ModelVoiceSelector />
            </section>

            <ReasoningEffortSelector />

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Translation overlay
              </h3>
              <TranslationToggle />
            </section>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => reset()}
              >
                Reset to defaults
              </Button>
            </div>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
