/**
 * Template store (#173 V1 — single-task templates).
 *
 * A template is a reusable snapshot of a task's authored fields. "Save as
 * template" captures a task's fields into a named blueprint; "instantiate"
 * rebuilds a fresh task from that blueprint with progress reset and new ids —
 * the same field-copy + reset contract as single-task Duplicate (#161), so the
 * two stay behaviourally aligned.
 */
import { create } from "zustand";
import { templateApi } from "@/api/client";
import { useTasksStore } from "@/store/useTasksStore";
import type { Task, TaskCreateInput, TaskTemplate, TemplatePayload } from "@/types/task";
import { toast } from "@/store/useToastStore";
import { t, pickLocale } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { clientId } from "@/lib/id";

/** Build a reusable template payload from a live task (drops per-instance progress). */
export function payloadFromTask(task: Task): TemplatePayload {
  return {
    title: task.title,
    desc: task.desc ?? undefined,
    quadrant: task.quadrant,
    today: task.today,
    week_focus: task.week_focus,
    due: task.due ?? undefined,
    duration: task.duration,
    pomos_total: task.pomos_total,
    assignee_ids: task.assignee_ids ?? [],
    recurrence: task.recurrence ?? "none",
    scheduled_start: task.scheduled_start ?? undefined,
    // NB: `remind_at` is intentionally NOT captured — a template is reused later,
    // so a baked-in wall-clock reminder would be stale/in the past. This also
    // matches useTasksStore.duplicate, which likewise does not copy remind_at.
    // Subtasks travel as titles only (ids + completion regenerated on use);
    // drop blank titles — the template schema requires title.min(1) whereas a
    // live task may hold an empty-title subtask.
    subtasks: (task.subtasks ?? [])
      .map((s) => ({ title: s.title.trim() }))
      .filter((s) => s.title.length > 0),
  };
}

/** Build a fresh TaskCreateInput from a template payload (new subtask ids, reset progress). */
export function inputFromPayload(payload: TemplatePayload): TaskCreateInput {
  return {
    title: payload.title,
    desc: payload.desc ?? undefined,
    quadrant: payload.quadrant,
    today: payload.today,
    week_focus: payload.week_focus,
    due: payload.due ?? undefined,
    duration: payload.duration,
    pomos_total: payload.pomos_total,
    assignee_ids: payload.assignee_ids ?? [],
    recurrence: payload.recurrence ?? "none",
    scheduled_start: payload.scheduled_start ?? undefined,
    subtasks: (payload.subtasks ?? []).map((s) => ({
      id: clientId("st"),
      title: s.title,
      completed: false,
    })),
  };
}

interface TemplatesState {
  templates: TaskTemplate[];
  load: () => Promise<void>;
  clear: () => void;
  /** Save an existing task as a template. Name defaults to the task's title. */
  saveFromTask: (task: Task, name?: string) => Promise<TaskTemplate | undefined>;
  /** Create a fresh task from a template (returns the new task). */
  instantiate: (id: string) => Promise<Task | undefined>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  templates: [],

  async load() {
    try {
      const templates = await templateApi.list();
      set({ templates });
    } catch (e) {
      toast.error(t("template.error.load"), e instanceof Error ? e.message : String(e));
    }
  },

  clear() {
    set({ templates: [] });
  },

  async saveFromTask(task, name) {
    const id = clientId("tpl");
    // Default the template name to the task's title in the active locale.
    const resolved =
      name?.trim() ||
      pickLocale(task.title, useAppStore.getState().locale).trim() ||
      t("template.library.title");
    try {
      const tpl = await templateApi.create(resolved, payloadFromTask(task), id);
      set((s) => ({ templates: [tpl, ...s.templates] }));
      toast.success(t("template.saved"));
      return tpl;
    } catch (e) {
      // Toast and swallow — callers fire-and-forget from the ⋯ menu, so a
      // re-throw here would surface as an unhandled rejection.
      toast.error(t("template.error.create"), e instanceof Error ? e.message : String(e));
      return undefined;
    }
  },

  async instantiate(id) {
    const tpl = get().templates.find((x) => x.id === id);
    if (!tpl) throw new Error("template not found");
    // Reuse the tasks store create path so the new task lands in the cache and
    // fires all the usual side effects, exactly like Duplicate. Self-contained
    // error handling: the library button fire-and-forgets, so a thrown API error
    // must be toasted here, not left to become an unhandled rejection.
    try {
      const task = await useTasksStore.getState().create(inputFromPayload(tpl.payload));
      toast.success(t("template.instantiated"));
      return task;
    } catch (e) {
      toast.error(t("template.error.instantiate"), e instanceof Error ? e.message : String(e));
      return undefined;
    }
  },

  async rename(id, name) {
    try {
      const updated = await templateApi.rename(id, name);
      set((s) => ({ templates: s.templates.map((x) => (x.id === id ? updated : x)) }));
    } catch (e) {
      toast.error(t("template.error.update"), e instanceof Error ? e.message : String(e));
    }
  },

  async remove(id) {
    try {
      await templateApi.delete(id);
      set((s) => ({ templates: s.templates.filter((x) => x.id !== id) }));
      toast.success(t("template.deleted"));
    } catch (e) {
      toast.error(t("template.error.delete"), e instanceof Error ? e.message : String(e));
    }
  },
}));
