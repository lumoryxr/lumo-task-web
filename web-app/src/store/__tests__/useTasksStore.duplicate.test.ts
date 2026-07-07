import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Task, TaskCreateInput } from "@/types/task";

// Capture what create sends to the API (vi.hoisted so the mock factory can use it).
const { createTask } = vi.hoisted(() => ({
  createTask: vi.fn(async (input: TaskCreateInput, id?: string): Promise<Task> => ({
    id: id ?? "t_new",
    title: input.title,
    desc: input.desc ?? null,
    quadrant: (input.quadrant ?? "unclassified") as Task["quadrant"],
    today: input.today ?? false,
    week_focus: input.week_focus ?? false,
    due: input.due ?? null,
    duration: input.duration ?? 0,
    pomos_done: 0,
    pomos_total: input.pomos_total ?? 0,
    assignee_ids: input.assignee_ids ?? [],
    recurrence: (input.recurrence ?? "none") as Task["recurrence"],
    subtasks: input.subtasks ?? [],
    scheduled_start: input.scheduled_start ?? null,
    completed: false,
  })),
}));

vi.mock("@/api/client", () => ({ api: { createTask } }));
vi.mock("@/store/usePetStore", () => ({ usePetStore: { getState: () => ({ celebrate: vi.fn(), react: vi.fn(), recordCompletion: vi.fn(), species: "dog" }) } }));
vi.mock("@/store/useDogStore", () => ({ useDogStore: { getState: () => ({ addXP: vi.fn() }) }, XP_PER_TASK: 10 }));
vi.mock("@/store/useToastStore", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/i18n/useT", () => ({ t: (k: string) => k }));

import { useTasksStore } from "@/store/useTasksStore";

const SRC: Task = {
  id: "t_src",
  title: { en: "Write report", zh: "写报告" },
  desc: { en: "details" },
  quadrant: "Q2",
  today: true,
  week_focus: false,
  due: "2026-07-01",
  duration: 45,
  pomos_done: 3,
  pomos_total: 4,
  assignee_ids: ["p1"],
  recurrence: "weekly",
  subtasks: [
    { id: "st_1", title: "outline", completed: true },
    { id: "st_2", title: "draft", completed: false },
  ],
  scheduled_start: null,
  completed: false,
};

describe("useTasksStore.duplicate", () => {
  beforeEach(() => {
    createTask.mockClear();
    useTasksStore.setState({ tasks: [SRC], completed: [] });
  });

  it("copies editable fields and suffixes the title per locale", async () => {
    await useTasksStore.getState().duplicate("t_src");
    expect(createTask).toHaveBeenCalledTimes(1);
    const input = createTask.mock.calls[0][0];
    expect(input.title).toEqual({ en: "Write report (copy)", zh: "写报告（副本）" });
    expect(input.quadrant).toBe("Q2");
    expect(input.due).toBe("2026-07-01");
    expect(input.duration).toBe(45);
    expect(input.recurrence).toBe("weekly");
    expect(input.assignee_ids).toEqual(["p1"]);
    expect(input.today).toBe(true);
  });

  it("resets per-instance progress (pomos not copied, subtasks reset + new ids)", async () => {
    await useTasksStore.getState().duplicate("t_src");
    const input = createTask.mock.calls[0][0];
    // pomos_total copied (it's part of the task definition), pomos_done never sent.
    expect(input.pomos_total).toBe(4);
    expect((input as Record<string, unknown>).pomos_done).toBeUndefined();
    // subtasks keep titles but reset completion and get fresh ids.
    expect(input.subtasks).toHaveLength(2);
    expect(input.subtasks!.every((s) => s.completed === false)).toBe(true);
    expect(input.subtasks!.map((s) => s.title)).toEqual(["outline", "draft"]);
    expect(input.subtasks!.map((s) => s.id)).not.toContain("st_1");
  });

  it("inserts the duplicate into the store and returns it", async () => {
    const dup = await useTasksStore.getState().duplicate("t_src");
    expect(dup.id).not.toBe("t_src");
    expect(useTasksStore.getState().tasks.some((t) => t.id === dup.id)).toBe(true);
  });

  it("throws if the source task is missing", async () => {
    await expect(useTasksStore.getState().duplicate("nope")).rejects.toThrow();
    expect(createTask).not.toHaveBeenCalled();
  });
});
