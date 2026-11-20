import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CompletedEntryWireSchema } from "../focus.js";

const entry = {
  id: "c_1",
  task_id: "t_1",
  title: { en: "Ship v1" },
  duration: 30,
  quadrant: "Q1",
  startedAt: null,
  completedAt: "2026-11-20T10:00:00.000Z",
  project_id: null,
  tags: [],
  subtasks: [
    { id: "s1", title: "Write tests", completed: true },
    { id: "s2", title: "Deploy", completed: false },
  ],
};

describe("CompletedEntryWireSchema (history)", () => {
  test("carries the subtasks as they were when the task was closed", () => {
    assert.deepEqual(CompletedEntryWireSchema.parse(entry).subtasks, entry.subtasks);
  });

  test("an entry with no subtasks has an empty list", () => {
    assert.deepEqual(CompletedEntryWireSchema.parse({ ...entry, subtasks: [] }).subtasks, []);
  });

  test("subtasks are required and must be well-formed", () => {
    const { subtasks: _omit, ...missing } = entry;
    assert.throws(() => CompletedEntryWireSchema.parse(missing));
    assert.throws(() => CompletedEntryWireSchema.parse({ ...entry, subtasks: [{ id: "s1", title: "x" }] }));
  });
});
