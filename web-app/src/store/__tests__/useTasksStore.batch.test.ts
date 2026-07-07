import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Task } from "@/types/task";

const { completeTask, deleteTask, updateTask, listTasks, listCompletedToday } = vi.hoisted(() => ({
  completeTask: vi.fn(async (_id: string) => ({ logId: "l", duration: 25 })),
  deleteTask: vi.fn(async (_id: string) => undefined),
  updateTask: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ ...mk(id), ...patch })),
  listTasks: vi.fn(async () => [] as Task[]),
  listCompletedToday: vi.fn(async () => []),
}));

function mk(id: string, quadrant: Task["quadrant"] = "Q2"): Task {
  return {
    id,
    title: { en: id },
    quadrant,
    today: true,
    week_focus: false,
    due: null,
    duration: 0,
    pomos_done: 0,
    pomos_total: 0,
    assignee_ids: [],
    recurrence: "none",
    subtasks: [],
    scheduled_start: null,
    completed: false,
  };
}

const addXP = vi.fn();
const celebrate = vi.fn();
const react = vi.fn();
const recordCompletion = vi.fn();

vi.mock("@/api/client", () => ({ api: { completeTask, deleteTask, updateTask, listTasks, listCompletedToday } }));
vi.mock("@/store/usePetStore", () => ({ usePetStore: { getState: () => ({ celebrate, react, recordCompletion, species: "dog" }) } }));
vi.mock("@/store/useDogStore", () => ({ useDogStore: { getState: () => ({ addXP }) }, XP_PER_TASK: 10 }));
vi.mock("@/store/useToastStore", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/i18n/useT", () => ({ t: (k: string) => k }));

import { useTasksStore } from "@/store/useTasksStore";
import { toast } from "@/store/useToastStore";

beforeEach(() => {
  vi.clearAllMocks();
  listTasks.mockResolvedValue([]);
  listCompletedToday.mockResolvedValue([]);
  useTasksStore.setState({ tasks: [mk("a", "Q1"), mk("b"), mk("c")], completed: [], selectMode: false, selectedIds: [] });
});

describe("selection state", () => {
  it("toggleSelected adds then removes", () => {
    const s = useTasksStore.getState();
    s.toggleSelected("a");
    expect(useTasksStore.getState().selectedIds).toEqual(["a"]);
    useTasksStore.getState().toggleSelected("a");
    expect(useTasksStore.getState().selectedIds).toEqual([]);
  });

  it("setSelection de-dupes", () => {
    useTasksStore.getState().setSelection(["a", "a", "b"]);
    expect(useTasksStore.getState().selectedIds).toEqual(["a", "b"]);
  });

  it("leaving select mode clears the selection", () => {
    useTasksStore.getState().setSelection(["a", "b"]);
    useTasksStore.getState().setSelectMode(false);
    expect(useTasksStore.getState().selectedIds).toEqual([]);
    expect(useTasksStore.getState().selectMode).toBe(false);
  });
});

describe("completeBatch", () => {
  it("completes all, reloads once, awards XP per success, one aggregate cheer", async () => {
    listTasks.mockResolvedValue([mk("c")]); // a,b completed away
    const r = await useTasksStore.getState().completeBatch(["a", "b"]);
    expect(r).toEqual({ ok: 2, failed: 0 });
    expect(completeTask).toHaveBeenCalledTimes(2);
    expect(listTasks).toHaveBeenCalledTimes(1); // not once-per-task
    expect(addXP).toHaveBeenCalledWith(20); // 10 * 2
    expect(celebrate).toHaveBeenCalledTimes(1); // "a" was Q1 → upgraded cheer
    expect(react).not.toHaveBeenCalled();
    expect(recordCompletion).toHaveBeenCalledTimes(1); // happiness recovers once per batch
  });

  it("non-Q1 batch gives a plain react, not a celebrate", async () => {
    await useTasksStore.getState().completeBatch(["b", "c"]);
    expect(react).toHaveBeenCalledTimes(1);
    expect(celebrate).not.toHaveBeenCalled();
  });

  it("counts partial failures and toasts", async () => {
    completeTask.mockImplementationOnce(async () => ({ logId: "l", duration: 1 }));
    completeTask.mockImplementationOnce(async () => { throw new Error("boom"); });
    const r = await useTasksStore.getState().completeBatch(["a", "b"]);
    expect(r).toEqual({ ok: 1, failed: 1 });
    expect(toast.error).toHaveBeenCalled();
  });

  it("no-ops on empty input", async () => {
    const r = await useTasksStore.getState().completeBatch([]);
    expect(r).toEqual({ ok: 0, failed: 0 });
    expect(completeTask).not.toHaveBeenCalled();
  });
});

describe("removeBatch", () => {
  it("drops only the rows that deleted", async () => {
    deleteTask.mockImplementationOnce(async () => undefined); // a ok
    deleteTask.mockImplementationOnce(async () => { throw new Error("no"); }); // b fails
    const r = await useTasksStore.getState().removeBatch(["a", "b"]);
    expect(r).toEqual({ ok: 1, failed: 1 });
    const ids = useTasksStore.getState().tasks.map((t) => t.id);
    expect(ids).toContain("b"); // failed delete stays
    expect(ids).not.toContain("a"); // succeeded delete gone
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("moveBatch", () => {
  it("applies server-confirmed quadrant to each row by id", async () => {
    const r = await useTasksStore.getState().moveBatch(["a", "b"], "Q3");
    expect(r).toEqual({ ok: 2, failed: 0 });
    const byId = Object.fromEntries(useTasksStore.getState().tasks.map((t) => [t.id, t]));
    expect(byId.a.quadrant).toBe("Q3");
    expect(byId.b.quadrant).toBe("Q3");
    expect(byId.c.quadrant).toBe("Q2"); // untouched
  });

  it("leaves failed rows unchanged", async () => {
    updateTask.mockImplementationOnce(async (id: string, patch: Record<string, unknown>) => ({ ...mk(id), ...patch }));
    updateTask.mockImplementationOnce(async () => { throw new Error("nope"); });
    const r = await useTasksStore.getState().moveBatch(["a", "b"], "Q4");
    expect(r).toEqual({ ok: 1, failed: 1 });
    const byId = Object.fromEntries(useTasksStore.getState().tasks.map((t) => [t.id, t]));
    expect(byId.a.quadrant).toBe("Q4");
    expect(byId.b.quadrant).toBe("Q2"); // failed move kept original
  });
});
