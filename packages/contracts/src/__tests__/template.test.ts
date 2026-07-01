import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  TemplateCreateBodySchema,
  TemplateUpdateBodySchema,
  TemplateWireSchema,
  TemplatePayloadSchema,
  ProjectTemplatePayloadSchema,
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

  test("rejects an unknown kind", () => {
    assert.throws(() =>
      TemplateCreateBodySchema.parse({ name: "x", kind: "habit", payload: { title: { en: "x" } } }),
    );
  });

  test("accepts a project template with a valid project payload (#211 V2 ⭐3)", () => {
    const b = TemplateCreateBodySchema.parse({
      name: "Launch plan",
      kind: "project",
      payload: { name: "Launch", goals: [{ text: "Ship v1" }], tasks: [{ title: { en: "Draft" } }] },
    });
    assert.equal(b.kind, "project");
    if (b.kind === "project") {
      assert.equal(b.payload.name, "Launch");
      assert.equal(b.payload.color, "green"); // default applied
      assert.equal(b.payload.goals.length, 1);
      assert.equal(b.payload.tasks.length, 1);
    }
  });

  test("rejects a project template whose payload is a task payload", () => {
    assert.throws(() =>
      TemplateCreateBodySchema.parse({ name: "x", kind: "project", payload: { title: { en: "x" } } }),
    );
  });
});

describe("ProjectTemplatePayloadSchema", () => {
  test("defaults color and empty goals/tasks", () => {
    const p = ProjectTemplatePayloadSchema.parse({ name: "P" });
    assert.equal(p.color, "green");
    assert.deepEqual(p.goals, []);
    assert.deepEqual(p.tasks, []);
  });

  test("rejects a missing name", () => {
    assert.throws(() => ProjectTemplatePayloadSchema.parse({ goals: [] }));
  });

  test("rejects an unknown color", () => {
    assert.throws(() => ProjectTemplatePayloadSchema.parse({ name: "P", color: "pink" }));
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

  test("accepts a project-kind wire payload", () => {
    const wire = {
      id: "tpl_2",
      name: "Launch plan",
      kind: "project",
      payload: { name: "Launch", color: "cyan", goals: [{ text: "Ship" }], tasks: [] },
      created_at: "2026-06-28T10:00:00.000Z",
    };
    assert.doesNotThrow(() => TemplateWireSchema.parse(wire));
  });
});
