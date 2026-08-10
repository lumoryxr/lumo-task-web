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
