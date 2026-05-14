import Link from "next/link";
import { GatedClientProviders } from "./settings-providers";
import { HeaderActions } from "./header-actions";

/**
 * Shared chrome for gated routes. The route group is purely for layout
 * composition — the underlying proxy already requires the gate cookie
 * for every non-`/gate` path.
 */
export default function GatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GatedClientProviders>
      <div className="flex min-h-screen flex-col bg-neutral-50 dark:bg-neutral-950">
        <header className="border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
            <Link
              href="/"
              className="text-sm font-medium text-neutral-700 hover:text-neutral-900 dark:text-neutral-200 dark:hover:text-white"
            >
              ← Home
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/history"
                className="text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
              >
                History
              </Link>
              <span className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                Realtime Voice
              </span>
              <HeaderActions />
            </div>
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </GatedClientProviders>
  );
}
