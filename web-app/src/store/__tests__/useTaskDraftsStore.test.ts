import { describe, it, expect, beforeEach } from "vitest";
import { useTaskDraftsStore, MAX_EDIT_DRAFTS, type CreateDraft, type EditDraftFields } from "@/store/useTaskDraftsStore";

const createDraft: CreateDraft = {
  title: "Write spec", quadrant: "Q1", duration: 45, dueDate: "2026-11-21",
  assigneeIds: ["p1"], recurrence: "none", tags: ["work"], projectId: null,
};

const fields = (title: string): EditDraftFields => ({
  title, desc: "", quadrant: "Q2", duration: 30, dueDate: "", scheduledStart: "", remindAt: "",
  recurrence: "none", assigneeIds: [], tags: [], projectId: null, progress: 0, sectionId: null, stageId: null,
});

beforeEach(() => {
  localStorage.clear();
  useTaskDraftsStore.setState({ createDraft: null, editDrafts: {} });
});

describe("useTaskDraftsStore", () => {
  it("keeps one draft of the new-task form, and clears it", () => {
    useTaskDraftsStore.getState().saveCreateDraft(createDraft);
    expect(useTaskDraftsStore.getState().createDraft).toEqual(createDraft);
    useTaskDraftsStore.getState().clearCreateDraft();
    expect(useTaskDraftsStore.getState().createDraft).toBeNull();
  });

  it("persists drafts to browser storage so they survive a reload", () => {
    useTaskDraftsStore.getState().saveCreateDraft(createDraft);
    const raw = localStorage.getItem("lumo.taskDrafts.v1");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.createDraft.title).toBe("Write spec");
  });

  it("keeps an edit draft per task, tied to the task as it was when editing began", () => {
    useTaskDraftsStore.getState().saveEditDraft("t1", "base-1", fields("A"));
    useTaskDraftsStore.getState().saveEditDraft("t2", "base-2", fields("B"));
    expect(useTaskDraftsStore.getState().editDrafts.t1).toMatchObject({ base: "base-1", fields: { title: "A" } });
    useTaskDraftsStore.getState().clearEditDraft("t1");
    expect(useTaskDraftsStore.getState().editDrafts.t1).toBeUndefined();
    expect(useTaskDraftsStore.getState().editDrafts.t2).toBeDefined();
  });

  it(`keeps only the ${MAX_EDIT_DRAFTS} most recent edit drafts`, () => {
    for (let i = 0; i < MAX_EDIT_DRAFTS + 3; i++) {
      useTaskDraftsStore.getState().saveEditDraft(`t${i}`, "b", fields(String(i)));
    }
    const ids = Object.keys(useTaskDraftsStore.getState().editDrafts);
    expect(ids).toHaveLength(MAX_EDIT_DRAFTS);
    expect(ids).not.toContain("t0");
    expect(ids).toContain(`t${MAX_EDIT_DRAFTS + 2}`);
  });

  it("trims by age even when task ids look like numbers", () => {
    for (let i = 100; i > 100 - (MAX_EDIT_DRAFTS + 1); i--) {
      useTaskDraftsStore.getState().saveEditDraft(String(i), "b", fields(String(i)));
    }
    const ids = Object.keys(useTaskDraftsStore.getState().editDrafts);
    expect(ids).not.toContain("100"); // saved first → oldest
    expect(ids).toContain(String(100 - MAX_EDIT_DRAFTS));
  });
});
