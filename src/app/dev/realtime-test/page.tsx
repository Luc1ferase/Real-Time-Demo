import { TestBench } from "./test-bench";

export const metadata = {
  title: "Realtime Provider Test Bench",
  description:
    "Smoke-test the OpenAI and Gemini Realtime providers behind the gate.",
};

export default function RealtimeTestPage() {
  return (
    <main className="flex min-h-screen flex-col bg-neutral-50 px-6 py-10 dark:bg-neutral-950">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            Dev tools · PR2 smoke test
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Realtime Provider Test Bench
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Pick a provider, connect, then send a text turn. The transcript log
            below shows whatever the provider streams back. No audio capture
            yet — text round-trip is sufficient to prove the abstraction.
          </p>
        </header>
        <TestBench />
      </div>
    </main>
  );
}
