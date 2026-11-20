import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Task } from "@/types/task";

const { updateTask } = vi.hoisted(() => ({ updateTask: vi.fn() }));

vi.mock("@/api/client", () => ({ api: { updateTask } }));
vi.mock("@/store/usePetStore", () => ({ usePetStore: { getState: () => ({}) } }));
vi.mock("@/store/useDogStore", () => ({ useDogStore: { getState: () => ({}) }, XP_PER_TASK: 10 }));
vi.mock("@/store/useToastStore", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/i18n/useT", () => ({ t: (k: string) => k }));

import { useTasksStore } from "@/store/useTasksStore";

const TASK: Task = {
  id: "t1", title: { en: "x" }, quadrant: "Q2", today: false, week_focus: false, due: null,
  duration: 0, pomos_done: 0, pomos_total: 0, completed: false,
  subtasks: [
    { id: "s1", title: "Draft", completed: false },
    { id: "s2", title: "Review", completed: true, assignee_id: "p_old" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  useTasksStore.setState({ tasks: [TASK] });
});

describe("useTasksStore.setSubtaskAssignee", () => {
  it("assigns one subtask, optimistically, and saves the whole list", async () => {
    updateTask.mockResolvedValue(undefined);
    const pending = useTasksStore.getState().setSubtaskAssignee("t1", "s1", "p_ann");
    expect(useTasksStore.getState().tasks[0].subtasks?.[0].assignee_id).toBe("p_ann");
    await pending;
    expect(updateTask).toHaveBeenCalledWith("t1", {
      subtasks: [
        { id: "s1", title: "Draft", completed: false, assignee_id: "p_ann" },
        { id: "s2", title: "Review", completed: true, assignee_id: "p_old" },
      ],
    });
  });

  it("clears an assignee with null", async () => {
    updateTask.mockResolvedValue(undefined);
    await useTasksStore.getState().setSubtaskAssignee("t1", "s2", null);
    expect(useTasksStore.getState().tasks[0].subtasks?.[1].assignee_id).toBeNull();
  });

  it("rolls back when the save fails", async () => {
    updateTask.mockRejectedValue(new Error("offline"));
    await expect(useTasksStore.getState().setSubtaskAssignee("t1", "s1", "p_ann")).rejects.toThrow();
    expect(useTasksStore.getState().tasks[0].subtasks?.[0].assignee_id).toBeUndefined();
  });
});
