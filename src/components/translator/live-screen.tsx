"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PairedTranscript } from "./paired-transcript";
import type { PairedEntry } from "@/lib/translator/use-translator-session";

interface LiveScreenProps {
  entries: PairedEntry[];
  connectedAt: number | null;
  /** Mic indicator. Always true once the session is connected. */
  micActive: boolean;
  sourceLabel: string;
  targetLabel: string;
  warningMessage: string | null;
  onEnd(): void;
}

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function LiveScreen({
  entries,
  connectedAt,
  micActive,
  sourceLabel,
  targetLabel,
  warningMessage,
  onEnd,
}: LiveScreenProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (connectedAt === null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [connectedAt]);

  const elapsed = connectedAt === null ? 0 : now - connectedAt;
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
            {sourceLabel} → {targetLabel}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span
              className={[
                "size-2 rounded-full",
                micActive
                  ? "bg-emerald-500 animate-pulse"
                  : "bg-neutral-300 dark:bg-neutral-700",
              ].join(" ")}
              aria-hidden
            />
            {micActive ? "Mic live" : "Mic off"}
          </span>
          <span className="font-mono">{formatElapsed(elapsed)}</span>
        </div>
      </header>

      {warningMessage ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          {warningMessage}
        </div>
      ) : null}

      <PairedTranscript
        entries={entries}
        sourceLabel={sourceLabel}
        targetLabel={targetLabel}
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          Speak naturally. The translator streams continuously — pauses
          flush the current sentence.
        </p>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
        >
          End session
        </Button>
      </div>

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-lg font-semibold">End translator session?</h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              The current transcript will stay on screen so you can copy
              anything you need.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmOpen(false)}
              >
                Keep going
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setConfirmOpen(false);
                  onEnd();
                }}
              >
                End now
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
