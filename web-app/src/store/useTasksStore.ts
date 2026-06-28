/**
 * Task store — backed by the mock API client.
 *
 * Holds an in-memory cache plus loading flags so components can render
 * skeletons / show errors. Mutations call the API then update local
 * state from the response, which keeps the cache in sync with whatever
 * the (real or mock) backend says is canonical.
 */

import { create } from "zustand";
import { api } from "@/api/client";
import { clientId } from "@/lib/id";
import type { CompletedEntry, Subtask, Task, TaskCompleteResponse, TaskCreateInput, TaskUpdateInput } from "@/types/task";
import { toast } from "@/store/useToastStore";
import { t } from "@/i18n/useT";
import { usePetStore } from "@/store/usePetStore";
import { useDogStore, XP_PER_TASK } from "@/store/useDogStore";

interface TasksState {
  tasks: Task[];
  completed: CompletedEntry[];
  loading: boolean;
  error: string | null;
  // selectors
  byQuadrant: (q: Task["quadrant"]) => Task[];
  todayTasks: () => Task[];
  weekFocusTasks: () => Task[];
  // actions
  load: () => Promise<void>;
  clear: () => void;
  create: (input: TaskCreateInput) => Promise<Task>;
  update: (id: string, patch: TaskUpdateInput) => Promise<void>;
  complete: (id: string) => Promise<TaskCompleteResponse>;
  reopen: (logId: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
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

  byQuadrant: (q) => get().tasks.filter((t) => t.quadrant === q && !t.completed),
  todayTasks: () => get().tasks.filter((t) => t.today && !t.completed),
  weekFocusTasks: () => get().tasks.filter((t) => t.week_focus && !t.completed),

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
