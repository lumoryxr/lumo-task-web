import { create } from "zustand";
import { api } from "@/api/client";
import { useTasksStore } from "@/store/useTasksStore";
import type { CompletedEntry } from "@/types/task";

/** Entries per history page — small enough that opening the drawer is quick. */
const PAGE_SIZE = 50;

interface HistoryState {
  /** Loaded completed entries, newest first. */
  entries: CompletedEntry[];
  /** Cursor for the next (older) page; null once everything is loaded. */
  nextCursor: string | null;
  /** True once the first page has been fetched. */
  loaded: boolean;
  loading: boolean;
  loadingMore: boolean;
  /** The last load failed; the view offers a retry. */
  error: boolean;
  /** Fetch the first page (replacing anything loaded). */
  load: () => Promise<void>;
  /** Append the next older page, if there is one. */
  loadMore: () => Promise<void>;
  /** Reopen a closed task and drop its entry from the history. */
  reopen: (entryId: string) => Promise<void>;
}

/**
 * The completed-task history behind the History drawer. Loaded lazily, one page
 * at a time, only when the drawer is opened — so it costs nothing until used.
 */
export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  nextCursor: null,
  loaded: false,
  loading: false,
  loadingMore: false,
  error: false,

  async load() {
    if (get().loading) return;
    set({ loading: true, error: false });
    try {
      const { entries, nextCursor } = await api.listCompletedPage(undefined, PAGE_SIZE);
      set({ entries, nextCursor, loaded: true });
    } catch {
      set({ error: true });
    } finally {
      set({ loading: false });
    }
  },

  async loadMore() {
    const { nextCursor, loadingMore } = get();
    if (!nextCursor || loadingMore) return;
    set({ loadingMore: true, error: false });
    try {
      const page = await api.listCompletedPage(nextCursor, PAGE_SIZE);
      set((s) => ({ entries: [...s.entries, ...page.entries], nextCursor: page.nextCursor }));
    } catch {
      set({ error: true });
    } finally {
      set({ loadingMore: false });
    }
  },

  async reopen(entryId) {
    try {
      // The tasks store restores the task and surfaces any error toast.
      await useTasksStore.getState().reopen(entryId);
      set((s) => ({ entries: s.entries.filter((e) => e.id !== entryId) }));
    } catch {
      // Keep the entry: the reopen did not happen.
    }
  },
}));
