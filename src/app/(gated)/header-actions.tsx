"use client";

import { SettingsDrawer } from "@/components/settings/settings-drawer";

/**
 * Thin client wrapper that keeps the gear-icon trigger in the gated
 * header without converting `layout.tsx` into a client component.
 */
export function HeaderActions() {
  return <SettingsDrawer />;
}
