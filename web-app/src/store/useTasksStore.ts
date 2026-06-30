/**
 * Task store — backed by the real API client (@/api/client).
 *
 * Holds an in-memory cache plus loading flags so components can render
 * skeletons / show errors. Mutations call the API then update local
 * state from the response, which keeps the cache in sync with whatever
 * the backend says is canonical.
 */

import { create } from "zustand";
import { api } from "@/api/client";
import { clientId } from "@/lib/id";
import type { CompletedEntry, Subtask, Task, TaskCompleteResponse, TaskCreateInput, TaskUpdateInput } from "@/types/task";
import { toast } from "@/store/useToastStore";
import { t } from "@/i18n/useT";
import { usePetStore } from "@/store/usePetStore";
import { useDogStore, XP_PER_TASK } from "@/store/useDogStore";

/** Outcome of a bulk action — how many of the requested ids succeeded vs failed. */
export interface BatchResult {
  ok: number;
  failed: number;
}

interface TasksState {
  tasks: Task[];
  completed: CompletedEntry[];
  loading: boolean;
  error: string | null;
  // transient multi-select state (not persisted / not synced)
  selectMode: boolean;
  selectedIds: string[];
  // selectors
  byQuadrant: (q: Task["quadrant"]) => Task[];
  todayTasks: () => Task[];
  weekFocusTasks: () => Task[];
  // selection actions
  setSelectMode: (on: boolean) => void;
  toggleSelected: (id: string) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  // actions
  load: () => Promise<void>;
  clear: () => void;
  create: (input: TaskCreateInput) => Promise<Task>;
  duplicate: (id: string) => Promise<Task>;
  update: (id: string, patch: TaskUpdateInput) => Promise<void>;
  complete: (id: string) => Promise<TaskCompleteResponse>;
  reopen: (logId: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  completeBatch: (ids: string[]) => Promise<BatchResult>;
  removeBatch: (ids: string[]) => Promise<BatchResult>;
  moveBatch: (ids: string[], quadrant: Task["quadrant"]) => Promise<BatchResult>;
  classifyTasks: () => Promise<Array<{ task_id: string; quadrant: string; confidence: number; reason?: string }>>;
  parseTaskText: (text: string, locale?: string) => Promise<{ title: string; quadrant: string; due: string | null; duration: number | null; confidence: number }>;
  fetchAllCompleted: () => Promise<import("@/types/task").CompletedEntry[]>;
  addSubtask: (taskId: string, title: string) => Promise<void>;
  toggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  deleteSubtask: (taskId: string, subtaskId: string) => Promise<void>;
  breakdownSubtasks: (taskId: string, locale?: string) => Promise<{ subtasks: string[]; cloudLimitReached: boolean }>;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  completed: [],
  loading: false,
  error: null,
  selectMode: false,
  selectedIds: [],

  byQuadrant: (q) => get().tasks.filter((t) => t.quadrant === q && !t.completed),
  todayTasks: () => get().tasks.filter((t) => t.today && !t.completed),
  weekFocusTasks: () => get().tasks.filter((t) => t.week_focus && !t.completed),

  setSelectMode(on) {
    // Leaving select mode always drops any pending selection so the next
    // entry starts clean.
    set(on ? { selectMode: true } : { selectMode: false, selectedIds: [] });
  },
  toggleSelected(id) {
    const cur = get().selectedIds;
    set({ selectedIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  },
  setSelection(ids) {
    // De-dupe defensively so a count derived from selectedIds.length is honest.
    set({ selectedIds: Array.from(new Set(ids)) });
  },
  clearSelection() {
    set({ selectedIds: [] });
  },

  async load() {
    set({ loading: true, error: null });
    try {
      const [tasks, completed] = await Promise.all([api.listTasks(), api.listCompletedToday()]);
      set({ tasks, completed, loading: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: msg });
      toast.error(t("error.task.load"), msg);
    }
  },

  clear() {
    set({ tasks: [], completed: [], loading: false, error: null });
  },

  async create(input) {
    // Client-generated id so an optimistic insert has a stable id before the
    // server round-trip resolves.
    const id = clientId("t");
    try {
      const task = await api.createTask(input, id);
      set({ tasks: [task, ...get().tasks] });
      return task;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(t("error.task.create"), msg);
      throw e;
    }
  },

  async duplicate(id) {
    const src = get().tasks.find((tk) => tk.id === id);
    if (!src) throw new Error("task not found");
    // Copy the editable fields into a fresh task. Reset per-instance progress
    // (completion, pomodoros, completion state) and give subtasks new ids so the
    // copy is independent of the original. Title gets a per-locale "copy" suffix.
    const title: typeof src.title = {
      en: `${src.title.en} (copy)`,
      ...(src.title.zh !== undefined ? { zh: `${src.title.zh}（副本）` } : {}),
    };
    const input: TaskCreateInput = {
      title,
      desc: src.desc ?? undefined,
      quadrant: src.quadrant,
      today: src.today,
      week_focus: src.week_focus,
      due: src.due ?? undefined,
      duration: src.duration,
      pomos_total: src.pomos_total,
      assignee_ids: src.assignee_ids ?? [],
      recurrence: src.recurrence ?? "none",
      scheduled_start: src.scheduled_start ?? undefined,
      subtasks: (src.subtasks ?? []).map((s) => ({
        id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: s.title,
        completed: false,
      })),
    };
    return get().create(input);
  },

  async update(id, patch) {
    try {
      const next = await api.updateTask(id, patch);
      set({ tasks: get().tasks.map((t) => (t.id === id ? next : t)) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(t("error.task.update"), msg);
      throw e;
    }
  },

  async complete(id) {
    try {
      const completingTask = get().tasks.find((tk) => tk.id === id);
      const result = await api.completeTask(id);
      const [tasks, completed] = await Promise.all([api.listTasks(), api.listCompletedToday()]);
      set({ tasks, completed });
      if (completingTask?.quadrant === "Q1") {
        usePetStore.getState().celebrate("pet.celebrate.q1");
      } else {
        // Smaller wins still get a brief, message-less pet bounce as feedback.
        usePetStore.getState().react();
      }
      useDogStore.getState().addXP(XP_PER_TASK);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(t("error.task.complete"), msg);
      throw e;
    }
  },

  async reopen(logId) {
    try {
      await api.uncompleteTask(logId);
      const [tasks, completed] = await Promise.all([api.listTasks(), api.listCompletedToday()]);
      set({ tasks, completed });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(t("error.task.reopen"), msg);
      throw e;
    }
  },

  async remove(id) {
    try {
      await api.deleteTask(id);
      set({ tasks: get().tasks.filter((t) => t.id !== id) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(t("error.task.delete"), msg);
      throw e;
    }
  },

  async completeBatch(ids) {
    if (ids.length === 0) return { ok: 0, failed: 0 };
    // Snapshot quadrants before the round-trip so pet feedback reflects what was
    // actually completed (the reload drops them from the task list).
    const before = new Map(get().tasks.map((tk) => [tk.id, tk.quadrant]));
    const results = await Promise.allSettled(ids.map((id) => api.completeTask(id)));
    // Reload once (not per-task) so the cache reflects the server after the burst.
    const [tasks, completed] = await Promise.all([api.listTasks(), api.listCompletedToday()]);
    set({ tasks, completed });
    let ok = 0;
    let anyQ1 = false;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        ok += 1;
        if (before.get(ids[i]) === "Q1") anyQ1 = true;
      }
    });
    if (ok > 0) {
      // One aggregate celebration, not N — a Q1 in the batch upgrades the cheer.
      if (anyQ1) usePetStore.getState().celebrate("pet.celebrate.q1");
      else usePetStore.getState().react();
      useDogStore.getState().addXP(XP_PER_TASK * ok);
    }
    const failed = ids.length - ok;
    if (failed > 0) toast.error(t("error.batch.complete"), `${failed}/${ids.length}`);
    return { ok, failed };
  },

  async removeBatch(ids) {
    if (ids.length === 0) return { ok: 0, failed: 0 };
    const results = await Promise.allSettled(ids.map((id) => api.deleteTask(id)));
    // Only drop the rows that actually deleted; leave failures in place.
    const deleted = new Set(ids.filter((_, i) => results[i].status === "fulfilled"));
    set({ tasks: get().tasks.filter((tk) => !deleted.has(tk.id)) });
    const ok = deleted.size;
    const failed = ids.length - ok;
    if (failed > 0) toast.error(t("error.batch.delete"), `${failed}/${ids.length}`);
    return { ok, failed };
  },

  async moveBatch(ids, quadrant) {
    if (ids.length === 0) return { ok: 0, failed: 0 };
    const results = await Promise.allSettled(ids.map((id) => api.updateTask(id, { quadrant })));
    // Apply each server-confirmed row back into the cache by id.
    const updated = new Map<string, Task>();
    results.forEach((r, i) => {
      if (r.status === "fulfilled") updated.set(ids[i], r.value);
    });
    set({ tasks: get().tasks.map((tk) => updated.get(tk.id) ?? tk) });
    const ok = updated.size;
    const failed = ids.length - ok;
    if (failed > 0) toast.error(t("error.batch.move"), `${failed}/${ids.length}`);
    return { ok, failed };
  },

  async classifyTasks() {
    return api.classifyTasks();
  },
  async parseTaskText(text, locale) {
    return api.parseTask(text, locale);
  },
  async fetchAllCompleted() {
    return api.listAllCompleted();
  },

  async addSubtask(taskId, title) {
    const task = get().tasks.find((tk) => tk.id === taskId);
    if (!task) return;
    const newSubtask: Subtask = {
      id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      completed: false,
    };
    const subtasks = [...(task.subtasks ?? []), newSubtask];
    set({ tasks: get().tasks.map((tk) => tk.id === taskId ? { ...tk, subtasks } : tk) });
    try {
      await api.updateTask(taskId, { subtasks });
    } catch (e) {
      set({ tasks: get().tasks.map((tk) => tk.id === taskId ? task : tk) });
      throw e;
    }
  },

  async toggleSubtask(taskId, subtaskId) {
    const task = get().tasks.find((tk) => tk.id === taskId);
    if (!task) return;
    const subtasks = (task.subtasks ?? []).map((s) =>
      s.id === subtaskId ? { ...s, completed: !s.completed } : s
    );
    set({ tasks: get().tasks.map((tk) => tk.id === taskId ? { ...tk, subtasks } : tk) });
    try {
      await api.updateTask(taskId, { subtasks });
    } catch (e) {
      set({ tasks: get().tasks.map((tk) => tk.id === taskId ? task : tk) });
      throw e;
    }
  },

  async deleteSubtask(taskId, subtaskId) {
    const task = get().tasks.find((tk) => tk.id === taskId);
    if (!task) return;
    const subtasks = (task.subtasks ?? []).filter((s) => s.id !== subtaskId);
    set({ tasks: get().tasks.map((tk) => tk.id === taskId ? { ...tk, subtasks } : tk) });
    try {
      await api.updateTask(taskId, { subtasks });
    } catch (e) {
      set({ tasks: get().tasks.map((tk) => tk.id === taskId ? task : tk) });
      throw e;
    }
  },

  async breakdownSubtasks(taskId, locale) {
    return api.breakdownSubtasks(taskId, locale);
  },
}));
