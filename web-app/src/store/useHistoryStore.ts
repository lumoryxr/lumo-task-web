import { create } from "zustand";
import { api } from "@/api/client";
import { useTasksStore } from "@/store/useTasksStore";
import type { CompletedEntry } from "@/types/task";

/** Entries per history page — small enough that opening the drawer is quick. */
const PAGE_SIZE = 50;

interface HistoryState {
  /** The project the loaded history is scoped to; null = every project. */
  projectId: string | null;
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
  /**
   * Fetch the first page (replacing anything loaded), optionally scoped to one
   * project. Switching scope clears the old entries at once.
   */
  load: (projectId?: string | null) => Promise<void>;
  /** Append the next older page, if there is one. */
  loadMore: () => Promise<void>;
  /** Reopen a closed task and drop its entry from the history. */
  reopen: (entryId: string) => Promise<void>;
}

/**
 * The completed-task history behind the History drawer. Loaded lazily, one page
 * at a time, only when the drawer is opened — so it costs nothing until used.
 */
// Bumped by every load(); a response from an older load is dropped, so a slow
// page for one project can never land in another project's history.
let generation = 0;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  projectId: null,
  entries: [],
  nextCursor: null,
  loaded: false,
  loading: false,
  loadingMore: false,
  error: false,

  async load(projectId = null) {
    const gen = ++generation;
    const scopeChanged = projectId !== get().projectId;
    set({
      projectId,
      loading: true,
      loadingMore: false,
      error: false,
      ...(scopeChanged ? { entries: [], nextCursor: null, loaded: false } : {}),
    });
    try {
      const { entries, nextCursor } = await api.listCompletedPage(undefined, PAGE_SIZE, projectId ?? undefined);
      if (gen === generation) set({ entries, nextCursor, loaded: true });
    } catch {
      if (gen === generation) set({ error: true });
    } finally {
      if (gen === generation) set({ loading: false });
    }
  },

  async loadMore() {
    const { nextCursor, loadingMore, loading, projectId } = get();
    if (!nextCursor || loadingMore || loading) return;
    const gen = generation;
    set({ loadingMore: true, error: false });
    try {
      const page = await api.listCompletedPage(nextCursor, PAGE_SIZE, projectId ?? undefined);
      if (gen === generation) set((s) => ({ entries: [...s.entries, ...page.entries], nextCursor: page.nextCursor }));
    } catch {
      if (gen === generation) set({ error: true });
    } finally {
      if (gen === generation) set({ loadingMore: false });
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
