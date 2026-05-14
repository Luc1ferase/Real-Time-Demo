import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6 dark:bg-neutral-950">
      <div className="w-full max-w-2xl space-y-12">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            OpenAI Realtime API · 2026
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            Realtime Voice Demo
          </h1>
          <p className="text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
            Two voice agents on top of <code>gpt-realtime-2</code>: a structured
            mock interviewer and a live cross-language translator. Built to
            explore the latency, interruption, and tool-use ergonomics of
            OpenAI&apos;s May 2026 Realtime API.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-lg font-semibold">AI Mock Interviewer</h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Structured interview flow with stage-switching tool calls and a
              scorecard at the end. Optional live caption overlay.
            </p>
            <Button asChild className="mt-6">
              <Link href="/interview">Start interview →</Link>
            </Button>
          </article>

          <article className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-lg font-semibold">Live Translator</h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Streaming bidirectional translation using the dedicated{" "}
              <code>gpt-realtime-translate</code> endpoint.
            </p>
            <Button asChild className="mt-6">
              <Link href="/translator">Start translating →</Link>
            </Button>
          </article>
        </section>

        <p className="text-center text-xs text-neutral-500">
          or{" "}
          <Link
            href="/history"
            className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            browse past interviews →
          </Link>
        </p>

        <footer className="border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800">
          <p>
            Source:{" "}
            <Link
              className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
              href="https://github.com/Luc1ferase/Real-Time-Demo"
            >
              github.com/Luc1ferase/Real-Time-Demo
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
