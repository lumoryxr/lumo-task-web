import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  TaskWireSchema,
  TaskCreateBodySchema,
  TaskUpdateBodySchema,
  TaskCompleteResponseSchema,
} from "../task.js";

// A canonical, full backend response payload (mirrors rowToTask in
// backend/src/routes/tasks.ts). The contract must accept this verbatim.
const wireTask = {
  id: "t_abc123",
  assignee_ids: ["p_1"],
  title: { en: "Ship contract package", zh: "交付契约包" },
  desc: { en: "Wire the shared Zod schema" },
  quadrant: "Q1" as const,
  today: true,
  week_focus: false,
  due: "2026-06-21",
  duration: 30,
  pomos_done: 1,
  pomos_total: 4,
  conviction: 0.8,
  next_step: { en: "Write the test" },
  reason: null,
  ai_suggest: "Q1",
  completed: false,
  not_now: [{ id: "t_x", reason: { en: "lower leverage" } }],
  recurrence: "none" as const,
  subtasks: [{ id: "s_1", title: "stub", completed: false }],
  scheduled_start: null,
  remind_at: null,
  progress: 40,
  section_id: null,
  created_at: "2026-06-20T10:00:00.000Z",
  updated_at: "2026-06-20T10:00:00.000Z",
};

describe("TaskWireSchema (backend response contract)", () => {
  test("accepts a full, valid backend task payload", () => {
    assert.doesNotThrow(() => TaskWireSchema.parse(wireTask));
  });

  test("accepts nullable fields set to null", () => {
    const t = { ...wireTask, desc: null, conviction: null, next_step: null, due: null, ai_suggest: null };
    assert.doesNotThrow(() => TaskWireSchema.parse(t));
  });

  test("rejects a payload missing title.en", () => {
    const bad = { ...wireTask, title: { zh: "无英文" } };
    assert.throws(() => TaskWireSchema.parse(bad));
  });

  test("rejects an unknown quadrant", () => {
    const bad = { ...wireTask, quadrant: "Q9" };
    assert.throws(() => TaskWireSchema.parse(bad));
  });

  test("ai_suggest accepts a quadrant or null, and coerces legacy junk to null", () => {
    assert.equal(TaskWireSchema.parse({ ...wireTask, ai_suggest: "Q3" }).ai_suggest, "Q3");
    assert.equal(TaskWireSchema.parse({ ...wireTask, ai_suggest: null }).ai_suggest, null);
    // Read path is lenient: a non-enum legacy value is coerced to null (.catch(null))
    // rather than throwing, so one bad row can't 500 the whole list.
    assert.equal(TaskWireSchema.parse({ ...wireTask, ai_suggest: "maybe" }).ai_suggest, null);
  });
});

describe("TaskCompleteResponseSchema", () => {
  test("accepts { ok: true, entry_id }", () => {
    const parsed = TaskCompleteResponseSchema.parse({ ok: true, entry_id: "c_123" });
    assert.equal(parsed.entry_id, "c_123");
  });

  test("rejects ok: false or missing entry_id", () => {
    assert.throws(() => TaskCompleteResponseSchema.parse({ ok: false, entry_id: "c_1" }));
    assert.throws(() => TaskCompleteResponseSchema.parse({ ok: true }));
  });
});

describe("TaskCreateBodySchema (request contract)", () => {
  test("applies defaults for omitted optional fields", () => {
    const parsed = TaskCreateBodySchema.parse({ title: { en: "Hi" } });
    assert.equal(parsed.quadrant, "unclassified");
    assert.equal(parsed.recurrence, "none");
    assert.equal(parsed.today, false);
    assert.deepEqual(parsed.assignee_ids, []);
  });

  test("rejects a due date that is not YYYY-MM-DD", () => {
    assert.throws(() => TaskCreateBodySchema.parse({ title: { en: "Hi" }, due: "tomorrow" }));
  });

  test("rejects ai_suggest that is not a quadrant", () => {
    assert.doesNotThrow(() => TaskCreateBodySchema.parse({ title: { en: "Hi" }, ai_suggest: "Q1" }));
    assert.throws(() => TaskCreateBodySchema.parse({ title: { en: "Hi" }, ai_suggest: "foo" }));
  });

  test("trims, drops empty, and de-duplicates tags case-insensitively (first-seen order + casing kept)", () => {
    const parsed = TaskCreateBodySchema.parse({
      title: { en: "Hi" },
      tags: ["Work", "  work  ", "WORK", "Home", "home"],
    });
    assert.deepEqual(parsed.tags, ["Work", "Home"]);
  });

  test("still enforces per-tag length and the 20-tag cap before dedupe", () => {
    assert.throws(() => TaskCreateBodySchema.parse({ title: { en: "Hi" }, tags: ["x".repeat(31)] }));
    assert.throws(() =>
      TaskCreateBodySchema.parse({ title: { en: "Hi" }, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }),
    );
  });

  test("omitted tags default to an empty array on create", () => {
    assert.deepEqual(TaskCreateBodySchema.parse({ title: { en: "Hi" } }).tags, []);
  });
});

describe("TaskUpdateBodySchema (partial request contract)", () => {
  test("accepts an empty patch", () => {
    assert.doesNotThrow(() => TaskUpdateBodySchema.parse({}));
  });

  test("accepts a single-field patch", () => {
    const parsed = TaskUpdateBodySchema.parse({ quadrant: "Q2" });
    assert.equal(parsed.quadrant, "Q2");
  });

  test("an empty patch does NOT inject a tags key (so the backend keeps existing tags)", () => {
    const parsed = TaskUpdateBodySchema.parse({});
    assert.equal("tags" in parsed, false);
  });

  test("de-duplicates tags when they are present in a patch", () => {
    const parsed = TaskUpdateBodySchema.parse({ tags: ["a", "A", "b"] });
    assert.deepEqual(parsed.tags, ["a", "b"]);
  });
});

describe("task progress (completion percentage)", () => {
  test("the wire task carries an integer 0..100 progress", () => {
    assert.equal(TaskWireSchema.parse(wireTask).progress, 40);
  });

  test("the wire task rejects a missing, fractional or out-of-range progress", () => {
    const { progress: _omit, ...missing } = wireTask;
    assert.throws(() => TaskWireSchema.parse(missing));
    assert.throws(() => TaskWireSchema.parse({ ...wireTask, progress: 12.5 }));
    assert.throws(() => TaskWireSchema.parse({ ...wireTask, progress: 101 }));
    assert.throws(() => TaskWireSchema.parse({ ...wireTask, progress: -1 }));
  });

  test("a created task defaults to 0% progress", () => {
    assert.equal(TaskCreateBodySchema.parse({ title: { en: "New" } }).progress, 0);
  });

  test("create accepts the bounds 0 and 100", () => {
    assert.equal(TaskCreateBodySchema.parse({ title: { en: "x" }, progress: 0 }).progress, 0);
    assert.equal(TaskCreateBodySchema.parse({ title: { en: "x" }, progress: 100 }).progress, 100);
  });

  test("a patch can set progress on its own", () => {
    assert.deepEqual(TaskUpdateBodySchema.parse({ progress: 75 }), { progress: 75 });
  });

  test("a patch that omits progress does not touch it", () => {
    assert.equal("progress" in TaskUpdateBodySchema.parse({ title: { en: "Renamed" } }), false);
  });

  test("a patch rejects an out-of-range or fractional progress", () => {
    assert.equal(TaskUpdateBodySchema.safeParse({ progress: 150 }).success, false);
    assert.equal(TaskUpdateBodySchema.safeParse({ progress: 33.3 }).success, false);
  });
});

describe("task section (custom group inside a project)", () => {
  test("the wire task carries a nullable section_id", () => {
    assert.equal(TaskWireSchema.parse(wireTask).section_id, null);
    assert.equal(TaskWireSchema.parse({ ...wireTask, section_id: "sec_a" }).section_id, "sec_a");
    const { section_id: _omit, ...missing } = wireTask;
    assert.throws(() => TaskWireSchema.parse(missing));
  });

  test("create accepts a section id or null, and rejects a malformed id", () => {
    assert.equal(TaskCreateBodySchema.parse({ title: { en: "x" }, section_id: "sec_a" }).section_id, "sec_a");
    assert.equal(TaskCreateBodySchema.parse({ title: { en: "x" }, section_id: null }).section_id, null);
    assert.equal(TaskCreateBodySchema.safeParse({ title: { en: "x" }, section_id: "no spaces" }).success, false);
  });

  test("a patch can move a task to a group or out of all groups", () => {
    assert.deepEqual(TaskUpdateBodySchema.parse({ section_id: "sec_b" }), { section_id: "sec_b" });
    assert.deepEqual(TaskUpdateBodySchema.parse({ section_id: null }), { section_id: null });
    assert.equal("section_id" in TaskUpdateBodySchema.parse({ today: true }), false);
  });
});
