import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  TemplateCreateBodySchema,
  TemplateUpdateBodySchema,
  TemplateWireSchema,
  TemplatePayloadSchema,
} from "../template.js";

describe("TemplatePayloadSchema", () => {
  test("applies defaults for omitted optional fields", () => {
    const p = TemplatePayloadSchema.parse({ title: { en: "x" } });
    assert.equal(p.quadrant, "unclassified");
    assert.equal(p.today, false);
    assert.equal(p.duration, 0);
    assert.equal(p.recurrence, "none");
    assert.deepEqual(p.subtasks, []);
    assert.deepEqual(p.assignee_ids, []);
  });

  test("rejects a payload with no title", () => {
    assert.throws(() => TemplatePayloadSchema.parse({ quadrant: "Q1" }));
  });

  test("rejects an unknown quadrant", () => {
    assert.throws(() => TemplatePayloadSchema.parse({ title: { en: "x" }, quadrant: "Q9" }));
  });

  test("keeps subtasks as titles only", () => {
    const p = TemplatePayloadSchema.parse({ title: { en: "x" }, subtasks: [{ title: "a" }] });
    assert.deepEqual(p.subtasks, [{ title: "a" }]);
  });
});

describe("TemplateCreateBodySchema", () => {
  test("accepts a named single-task template and defaults kind to 'task'", () => {
    const b = TemplateCreateBodySchema.parse({ name: "Weekly", payload: { title: { en: "x" } } });
    assert.equal(b.kind, "task");
    assert.equal(b.name, "Weekly");
  });

  test("rejects a missing name", () => {
    assert.throws(() => TemplateCreateBodySchema.parse({ payload: { title: { en: "x" } } }));
  });

  test("rejects a non-task kind (V1)", () => {
    assert.throws(() =>
      TemplateCreateBodySchema.parse({ name: "x", kind: "project", payload: { title: { en: "x" } } }),
    );
  });
});

describe("TemplateUpdateBodySchema", () => {
  test("accepts a name-only patch", () => {
    assert.doesNotThrow(() => TemplateUpdateBodySchema.parse({ name: "renamed" }));
  });
  test("accepts an empty patch", () => {
    assert.doesNotThrow(() => TemplateUpdateBodySchema.parse({}));
  });
});

describe("TemplateWireSchema", () => {
  test("accepts a full backend response payload", () => {
    const wire = {
      id: "tpl_1",
      name: "Weekly",
      kind: "task",
      payload: { title: { en: "x" }, quadrant: "Q2", duration: 30, recurrence: "weekly", subtasks: [], assignee_ids: [] },
      created_at: "2026-06-28T10:00:00.000Z",
    };
    assert.doesNotThrow(() => TemplateWireSchema.parse(wire));
  });
});
