"use client";

import { SettingsProvider } from "@/lib/settings/settings-context";

/**
 * Client-only wrapper that mounts the global <SettingsProvider> for every
 * gated route. Lives in a separate file so `(gated)/layout.tsx` can stay
 * a server component (SSR-friendly, no JS shipped for the layout shell
 * itself) while still wrapping its children in client context.
 */
export function GatedClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsProvider>{children}</SettingsProvider>;
}
