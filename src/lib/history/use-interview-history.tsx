"use client";

import { useCallback, useEffect, useState } from "react";
import {
  HISTORY_STORAGE_KEY,
  clearHistory,
  deleteHistoryEntry,
  listHistory,
  saveHistoryEntry,
} from "./storage";
import type { InterviewHistoryEntry } from "./types";

interface UseInterviewHistoryResult {
  entries: InterviewHistoryEntry[];
  /** Has the initial localStorage read completed? Useful for empty states. */
  hydrated: boolean;
  save(entry: InterviewHistoryEntry): void;
  remove(id: string): void;
  clear(): void;
}

/**
 * Client-side hook around the localStorage history list.
 *
 * - First render is empty (`entries=[]`, `hydrated=false`) so SSR + first
 *   client paint never disagree.
 * - A single `useEffect` reads localStorage and flips both pieces of
 *   state in one micro-task to avoid a triple render.
 * - The browser `storage` event keeps multiple tabs in sync (delete in
 *   tab A reflects on tab B's history page).
 */
export function useInterviewHistory(): UseInterviewHistoryResult {
  const [entries, setEntries] = useState<InterviewHistoryEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const initial = listHistory();
    queueMicrotask(() => {
      setEntries(initial);
      setHydrated(true);
    });

    const onStorage = (event: StorageEvent) => {
      // Filter to our key. `event.key === null` means `clear()` was called
      // on another tab — reload to be safe.
      if (event.key !== null && event.key !== HISTORY_STORAGE_KEY) return;
      const next = listHistory();
      setEntries(next);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const save = useCallback((entry: InterviewHistoryEntry) => {
    const next = saveHistoryEntry(entry);
    setEntries(next);
  }, []);

  const remove = useCallback((id: string) => {
    const next = deleteHistoryEntry(id);
    setEntries(next);
  }, []);

  const clear = useCallback(() => {
    clearHistory();
    setEntries([]);
  }, []);

  return { entries, hydrated, save, remove, clear };
}
