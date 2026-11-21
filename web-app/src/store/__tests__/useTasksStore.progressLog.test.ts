import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Task } from "@/types/task";

const { updateTask } = vi.hoisted(() => ({ updateTask: vi.fn() }));

vi.mock("@/api/client", () => ({ api: { updateTask } }));
vi.mock("@/store/usePetStore", () => ({ usePetStore: { getState: () => ({}) } }));
vi.mock("@/store/useDogStore", () => ({ useDogStore: { getState: () => ({}) }, XP_PER_TASK: 10 }));
vi.mock("@/store/useToastStore", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/i18n/useT", () => ({ t: (k: string) => k }));

import { useTasksStore } from "@/store/useTasksStore";

const OLD = { id: "pn_old", date: "2026-11-20", text: "Collected data", created_at: "2026-11-20T09:00:00.000Z" };
const TASK: Task = {
  id: "t1", title: { en: "x" }, quadrant: "Q2", today: false, week_focus: false, due: null,
  duration: 0, pomos_done: 0, pomos_total: 0, completed: false, progress_log: [OLD],
};

const log = () => useTasksStore.getState().tasks[0].progress_log ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  updateTask.mockResolvedValue(undefined);
  useTasksStore.setState({ tasks: [TASK] });
});

describe("useTasksStore · progress log", () => {
  it("adds a dated note (trimmed), shown at once and saved with the whole log", async () => {
    const pending = useTasksStore.getState().addProgressNote("t1", { date: "2026-11-21", text: "  Wrote the summary  " });
    expect(log()).toHaveLength(2);
    const added = log()[1];
    expect(added).toMatchObject({ date: "2026-11-21", text: "Wrote the summary" });
    expect(added.id).toMatch(/^pn_/);
    expect(added.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await pending;
    expect(updateTask).toHaveBeenCalledWith("t1", { progress_log: [OLD, added] });
  });

  it("ignores a blank note", async () => {
    await useTasksStore.getState().addProgressNote("t1", { date: "2026-11-21", text: "   " });
    expect(updateTask).not.toHaveBeenCalled();
    expect(log()).toHaveLength(1);
  });

  it("edits a note's text and date, and marks it edited", async () => {
    await useTasksStore.getState().editProgressNote("t1", "pn_old", { date: "2026-11-19", text: "Collected all the data" });
    expect(log()[0]).toMatchObject({ id: "pn_old", date: "2026-11-19", text: "Collected all the data", created_at: OLD.created_at });
    expect(log()[0].edited_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(updateTask).toHaveBeenCalledTimes(1);
  });

  it("deletes a note", async () => {
    await useTasksStore.getState().deleteProgressNote("t1", "pn_old");
    expect(log()).toEqual([]);
    expect(updateTask).toHaveBeenCalledWith("t1", { progress_log: [] });
  });

  it("rolls back when the save fails", async () => {
    updateTask.mockRejectedValue(new Error("offline"));
    await expect(
      useTasksStore.getState().addProgressNote("t1", { date: "2026-11-21", text: "Lost?" }),
    ).rejects.toThrow();
    expect(log()).toEqual([OLD]);
  });
});
