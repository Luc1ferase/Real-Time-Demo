/**
 * Persistent shape of one interview session captured in localStorage.
 *
 * The list is bounded (see `MAX_HISTORY_ENTRIES` in `storage.ts`) and the
 * transcript text is stripped of empty / system entries before write to
 * keep individual entries well under ~30KB. Per-entry transcript ids are
 * dropped on persist — the history layer has its own `id`.
 */

import type { ProviderId, ReasoningEffort } from "@/lib/realtime/types";
import type {
  Difficulty,
  JobTrack,
} from "@/lib/realtime/interview-instructions";
import type { ScorecardPayload } from "@/lib/realtime/interview-tools";

export type EndReason = "completed" | "ended_early" | "timeout" | "error";

export interface PersistedTranscript {
  role: "user" | "assistant";
  text: string;
  /** Delta from `startedAt` in milliseconds (size-compact vs raw epoch). */
  ts: number;
}

export interface InterviewHistoryEntry {
  /** crypto.randomUUID(). */
  id: string;
  /** Epoch ms when status flipped to `live`. */
  startedAt: number;
  /** Epoch ms at the terminal transition. */
  endedAt: number;
  /** `endedAt - startedAt`; precomputed so list rows can render cheaply. */
  durationMs: number;
  provider: ProviderId;
  model: string;
  voice: string;
  reasoningEffort?: ReasoningEffort;
  jobType: JobTrack;
  difficulty: Difficulty;
  transcripts: PersistedTranscript[];
  scorecard?: ScorecardPayload;
  endReason: EndReason;
}
