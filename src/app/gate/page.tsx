import { Suspense } from "react";
import { GateForm } from "./gate-form";

export const metadata = {
  title: "Sign in — Realtime Voice",
};

export default function GatePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 dark:bg-neutral-950">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Realtime Voice
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Private preview · enter the access password to continue.
          </p>
        </header>
        <Suspense fallback={null}>
          <GateForm />
        </Suspense>
      </div>
    </main>
  );
}
