import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Quadrant, Task, TaskRecurrence } from "@/types/task";

/**
 * Unsaved task-form drafts, kept in browser storage so closing a form — or
 * reloading the page — never loses what was typed. These are local UI state,
 * not an API shape: nothing here is sent to the server.
 */

/** The new-task form (QuickCreate). One slot: the last unfinished task. */
export interface CreateDraft {
  title: string;
  quadrant: Quadrant;
  duration: number;
  dueDate: string;
  assigneeIds: string[];
  recurrence: TaskRecurrence;
  tags: string[];
  projectId: string | null;
}

/** The edit-task form (TaskEditModal), one per task. */
export interface EditDraftFields {
  title: string;
  desc: string;
  quadrant: Task["quadrant"];
  duration: number;
  dueDate: string;
  scheduledStart: string;
  remindAt: string;
  recurrence: TaskRecurrence;
  assigneeIds: string[];
  tags: string[];
  projectId: string | null;
  progress: number;
  sectionId: string | null;
  stageId: string | null;
}

export interface EditDraft {
  /**
   * The task's form values when editing began (serialised). A draft is only
   * restored while the task still matches it, so a stale draft never
   * overwrites changes made elsewhere since.
   */
  base: string;
  fields: EditDraftFields;
  savedAt: number;
}

/** Edit drafts kept at most; the oldest is dropped beyond this. */
export const MAX_EDIT_DRAFTS = 20;

interface TaskDraftsState {
  createDraft: CreateDraft | null;
  editDrafts: Record<string, EditDraft>;
  saveCreateDraft: (draft: CreateDraft) => void;
  clearCreateDraft: () => void;
  saveEditDraft: (taskId: string, base: string, fields: EditDraftFields) => void;
  clearEditDraft: (taskId: string) => void;
}

export const useTaskDraftsStore = create<TaskDraftsState>()(
  persist(
    (set) => ({
      createDraft: null,
      editDrafts: {},

      saveCreateDraft: (createDraft) => set({ createDraft }),
      clearCreateDraft: () => set({ createDraft: null }),

      saveEditDraft: (taskId, base, fields) =>
        set((s) => {
          // Strictly increasing, so the order is exact even within one millisecond.
          const latest = Math.max(0, ...Object.values(s.editDrafts).map((d) => d.savedAt));
          const next: Record<string, EditDraft> = {
            ...s.editDrafts,
            [taskId]: { base, fields, savedAt: Math.max(Date.now(), latest + 1) },
          };
          const byAge = Object.entries(next).sort((a, b) => a[1].savedAt - b[1].savedAt);
          for (const [id] of byAge.slice(0, Math.max(0, byAge.length - MAX_EDIT_DRAFTS))) delete next[id];
          return { editDrafts: next };
        }),

      clearEditDraft: (taskId) =>
        set((s) => {
          if (!(taskId in s.editDrafts)) return s;
          const { [taskId]: _gone, ...rest } = s.editDrafts;
          return { editDrafts: rest };
        }),
    }),
    {
      name: "lumo.taskDrafts.v1",
      partialize: (s) => ({ createDraft: s.createDraft, editDrafts: s.editDrafts }),
    },
  ),
);
