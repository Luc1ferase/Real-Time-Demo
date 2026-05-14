/**
 * Client-only localStorage-backed list of past interview sessions.
 *
 * Every export is SSR-safe: the helpers check `typeof window` before
 * touching `localStorage`, returning a neutral value on the server / on
 * first paint. Callers (the hook) only invoke these from `useEffect` or
 * event handlers so the empty-on-server return is never observable in
 * rendered HTML.
 *
 * Schema drift is treated as "discard all and start fresh" — see
 * `parseStored`. We'd rather lose stale history than crash the page.
 */

import { z } from "zod";
import type { InterviewHistoryEntry } from "./types";

export const HISTORY_STORAGE_KEY = "rt-demo-interview-history";

/** FIFO cap. 20 × ~30KB transcripts ≈ 600KB, well under the 5MB cap. */
export const MAX_HISTORY_ENTRIES = 20;

const persistedTranscriptSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  ts: z.number(),
});

const scorecardSchema = z.object({
  communication: z.number(),
  technical_depth: z.number(),
  structured_thinking: z.number(),
  summary: z.string(),
});

const historyEntrySchema: z.ZodType<InterviewHistoryEntry> = z.object({
  id: z.string(),
  startedAt: z.number(),
  endedAt: z.number(),
  durationMs: z.number(),
  provider: z.enum(["openai", "gemini"]),
  model: z.string(),
  voice: z.string(),
  reasoningEffort: z
    .enum(["minimal", "low", "medium", "high", "xhigh"])
    .optional(),
  jobType: z.enum(["frontend", "backend", "fullstack"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  transcripts: z.array(persistedTranscriptSchema),
  scorecard: scorecardSchema.optional(),
  endReason: z.enum(["completed", "ended_early", "timeout", "error"]),
});

const historyArraySchema = z.array(historyEntrySchema);

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function parseStored(raw: string | null): InterviewHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = historyArraySchema.safeParse(parsed);
    if (!result.success) return [];
    return result.data;
  } catch {
    return [];
  }
}

/** Read the full list (newest first). Returns `[]` on server or schema drift. */
export function listHistory(): InterviewHistoryEntry[] {
  if (!hasWindow()) return [];
  try {
    return parseStored(window.localStorage.getItem(HISTORY_STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeList(list: InterviewHistoryEntry[]): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded / Safari private mode — best-effort drop.
  }
}

/** Prepend a new entry; evict the tail when over `MAX_HISTORY_ENTRIES`. */
export function saveHistoryEntry(
  entry: InterviewHistoryEntry,
): InterviewHistoryEntry[] {
  const current = listHistory();
  // Newest first. Dedupe by id in case the same terminal transition fires
  // twice (defensive — the caller already guards against this).
  const filtered = current.filter((e) => e.id !== entry.id);
  const next = [entry, ...filtered].slice(0, MAX_HISTORY_ENTRIES);
  writeList(next);
  return next;
}

/** Remove an entry by id. Returns the updated list. */
export function deleteHistoryEntry(id: string): InterviewHistoryEntry[] {
  const current = listHistory();
  const next = current.filter((e) => e.id !== id);
  writeList(next);
  return next;
}

/** Wipe the entire history. */
export function clearHistory(): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // ignore
  }
}
