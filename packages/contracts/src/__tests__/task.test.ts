import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  TaskWireSchema,
  TaskCreateBodySchema,
  TaskUpdateBodySchema,
  TaskCompleteResponseSchema,
  primaryAssigneeId,
  MAX_PROGRESS_NOTES,
  MAX_PROGRESS_NOTE_LENGTH,
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
  stage_id: null,
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

describe("task stage (current phase within the project's stages)", () => {
  test("the wire task carries a nullable stage_id", () => {
    assert.equal(TaskWireSchema.parse(wireTask).stage_id, null);
    assert.equal(TaskWireSchema.parse({ ...wireTask, stage_id: "stg_build" }).stage_id, "stg_build");
    const { stage_id: _omit, ...missing } = wireTask;
    assert.throws(() => TaskWireSchema.parse(missing));
  });

  test("create accepts a stage id or null, and rejects a malformed id", () => {
    assert.equal(TaskCreateBodySchema.parse({ title: { en: "x" }, stage_id: "stg_a" }).stage_id, "stg_a");
    assert.equal(TaskCreateBodySchema.parse({ title: { en: "x" }, stage_id: null }).stage_id, null);
    assert.equal(TaskCreateBodySchema.safeParse({ title: { en: "x" }, stage_id: "bad id" }).success, false);
  });

  test("a patch can set or clear the stage, and omitting it leaves it alone", () => {
    assert.deepEqual(TaskUpdateBodySchema.parse({ stage_id: "stg_b" }), { stage_id: "stg_b" });
    assert.deepEqual(TaskUpdateBodySchema.parse({ stage_id: null }), { stage_id: null });
    assert.equal("stage_id" in TaskUpdateBodySchema.parse({ today: true }), false);
  });
});

describe("subtask assignee", () => {
  test("a subtask may name one assignee, or none", () => {
    const parsed = TaskUpdateBodySchema.parse({
      subtasks: [
        { id: "s1", title: "Draft", completed: false, assignee_id: "p_1" },
        { id: "s2", title: "Review", completed: false, assignee_id: null },
        { id: "s3", title: "Ship", completed: false },
      ],
    });
    assert.deepEqual(parsed.subtasks?.map((s) => s.assignee_id), ["p_1", null, undefined]);
  });

  test("the wire task round-trips a subtask assignee", () => {
    const t = { ...wireTask, subtasks: [{ id: "s1", title: "x", completed: true, assignee_id: "p_1" }] };
    assert.equal(TaskWireSchema.parse(t).subtasks[0].assignee_id, "p_1");
  });

  test("a malformed assignee id is rejected", () => {
    assert.equal(
      TaskUpdateBodySchema.safeParse({ subtasks: [{ id: "s1", title: "x", completed: false, assignee_id: "" }] }).success,
      false,
    );
  });
});

describe("primary assignee", () => {
  test("the first assignee is the primary one; order is kept", () => {
    const parsed = TaskCreateBodySchema.parse({ title: { en: "x" }, assignee_ids: ["p_2", "p_1", "p_3"] });
    assert.deepEqual(parsed.assignee_ids, ["p_2", "p_1", "p_3"]);
    assert.equal(primaryAssigneeId(parsed.assignee_ids), "p_2");
  });

  test("no assignees means no primary", () => {
    assert.equal(primaryAssigneeId([]), null);
    assert.equal(primaryAssigneeId(undefined), null);
    assert.equal(primaryAssigneeId(null), null);
  });

  test("the same person cannot be listed twice (the primary would be ambiguous)", () => {
    assert.equal(TaskCreateBodySchema.safeParse({ title: { en: "x" }, assignee_ids: ["p_1", "p_1"] }).success, false);
    assert.equal(TaskUpdateBodySchema.safeParse({ assignee_ids: ["p_1", "p_2", "p_1"] }).success, false);
    assert.equal(TaskUpdateBodySchema.safeParse({ assignee_ids: ["p_2", "p_1"] }).success, true);
  });

  test("a PATCH without assignee_ids leaves them alone", () => {
    assert.equal("assignee_ids" in TaskUpdateBodySchema.parse({ title: { en: "y" } }), false);
  });
});

describe("progress log (dated progress notes)", () => {
  const note = { id: "pn_1", date: "2026-11-21", text: "Drafted the outline", created_at: "2026-11-21T09:30:00.000Z" };

  test("a task carries dated notes; the log defaults to empty", () => {
    assert.deepEqual(TaskCreateBodySchema.parse({ title: { en: "x" } }).progress_log, []);
    const parsed = TaskUpdateBodySchema.parse({ progress_log: [note, { ...note, id: "pn_2", edited_at: "2026-11-21T10:00:00.000Z" }] });
    assert.equal(parsed.progress_log?.length, 2);
    assert.equal(parsed.progress_log?.[1].edited_at, "2026-11-21T10:00:00.000Z");
  });

  test("text is trimmed and must not be blank or too long", () => {
    assert.equal(TaskUpdateBodySchema.parse({ progress_log: [{ ...note, text: "  done  " }] }).progress_log?.[0].text, "done");
    assert.equal(TaskUpdateBodySchema.safeParse({ progress_log: [{ ...note, text: "   " }] }).success, false);
    assert.equal(TaskUpdateBodySchema.safeParse({ progress_log: [{ ...note, text: "x".repeat(MAX_PROGRESS_NOTE_LENGTH + 1) }] }).success, false);
  });

  test("the date is a calendar day, and ids are unique", () => {
    assert.equal(TaskUpdateBodySchema.safeParse({ progress_log: [{ ...note, date: "21/11/2026" }] }).success, false);
    assert.equal(TaskUpdateBodySchema.safeParse({ progress_log: [note, note] }).success, false);
  });

  test(`at most ${MAX_PROGRESS_NOTES} notes per task`, () => {
    const many = Array.from({ length: MAX_PROGRESS_NOTES + 1 }, (_, i) => ({ ...note, id: `pn_${i}` }));
    assert.equal(TaskUpdateBodySchema.safeParse({ progress_log: many }).success, false);
  });

  test("a PATCH without progress_log leaves it alone", () => {
    assert.equal("progress_log" in TaskUpdateBodySchema.parse({ progress: 40 }), false);
  });

  test("the wire task carries the log, and older payloads without it still parse", () => {
    assert.deepEqual(TaskWireSchema.parse({ ...wireTask, progress_log: [note] }).progress_log, [note]);
    const { progress_log: _omit, ...old } = { ...wireTask, progress_log: [] };
    assert.deepEqual(TaskWireSchema.parse(old).progress_log, []);
  });
});
