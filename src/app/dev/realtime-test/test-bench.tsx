"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRealtimeSession } from "@/lib/realtime/use-realtime-session";
import type { ProviderId } from "@/lib/realtime/types";

const DEFAULTS: Record<
  ProviderId,
  { model: string; voice: string; instructions: string }
> = {
  openai: {
    model: "gpt-realtime-2",
    voice: "marin",
    instructions:
      "You are a concise realtime test agent. Reply in one short sentence.",
  },
  gemini: {
    // TODO(PR3): Gemini provider is wired with `responseModalities: [AUDIO]`
    // so each connect burns audio-output tokens even though this bench only
    // renders the text transcript. Acceptable for protocol smoke-testing;
    // PR3 swaps in real audio playback so the cost is recovered.
    model: "gemini-3.1-flash-live-preview",
    voice: "Puck",
    instructions:
      "You are a concise realtime test agent. Reply in one short sentence.",
  },
};

const STATUS_LABEL: Record<string, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Error",
  closed: "Closed",
};

export function TestBench() {
  const [providerId, setProviderId] = useState<ProviderId>("openai");
  const [draft, setDraft] = useState("Say hello and then say goodbye.");

  const defaults = DEFAULTS[providerId];

  const session = useRealtimeSession({
    providerId,
    model: defaults.model,
    voice: defaults.voice,
    instructions: defaults.instructions,
  });

  const canConnect = session.status === "idle" || session.status === "closed" || session.status === "error";
  const canSend = session.status === "connected" && draft.trim().length > 0;

  const statusPillClass = useMemo(() => {
    switch (session.status) {
      case "connected":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
      case "connecting":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
      case "error":
        return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
      case "closed":
        return "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400";
      default:
        return "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400";
    }
  }, [session.status]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium" htmlFor="provider-select">
            Provider
          </label>
          <select
            id="provider-select"
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value as ProviderId)}
            disabled={session.status === "connecting" || session.status === "connected"}
          >
            <option value="openai">OpenAI ({DEFAULTS.openai.model})</option>
            <option value="gemini">Gemini ({DEFAULTS.gemini.model})</option>
          </select>

          <span className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${statusPillClass}`}>
            {STATUS_LABEL[session.status] ?? session.status}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              void session.connect();
            }}
            disabled={!canConnect}
          >
            Connect
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => session.disconnect()}
            disabled={session.status !== "connected" && session.status !== "connecting"}
          >
            Disconnect
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => session.interrupt()}
            disabled={session.status !== "connected"}
          >
            Interrupt
          </Button>
        </div>

        {session.error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {session.error.message}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold">Send text turn</h2>
        <div className="mt-3 flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a user turn…"
            disabled={session.status !== "connected"}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSend) {
                session.send(draft);
                setDraft("");
              }
            }}
          />
          <Button
            type="button"
            onClick={() => {
              if (!canSend) return;
              session.send(draft);
              setDraft("");
            }}
            disabled={!canSend}
          >
            Send
          </Button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Text turns do not produce a user transcript event — the user line
          you typed is the user turn. The transcript log below only captures
          what the providers stream back.
        </p>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold">Transcript</h2>
        {session.transcripts.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Nothing yet. Connect, send a turn, and the model&apos;s reply
            transcript will appear here.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {session.transcripts.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
              >
                <span className="mr-2 text-xs uppercase tracking-widest text-neutral-500">
                  {entry.role}
                  {!entry.done && entry.role === "assistant" ? " · streaming" : ""}
                </span>
                <span>{entry.text || <em className="text-neutral-500">(empty)</em>}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
