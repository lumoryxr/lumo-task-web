import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ProjectCreateBodySchema,
  ProjectUpdateBodySchema,
  ProjectWireSchema,
  ProjectSectionSchema,
  MAX_SECTIONS_PER_PROJECT,
} from "../project.js";

const wireProject = {
  id: "p_1",
  name: "Launch",
  color: "green",
  goals: [],
  status: "active",
  pinned: false,
  sections: [{ id: "sec_a", name: "Design" }],
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

describe("project sections (custom task groups)", () => {
  test("a section is an id plus a trimmed, non-empty name of at most 60 chars", () => {
    assert.deepEqual(ProjectSectionSchema.parse({ id: "s1", name: "  Dev  " }), { id: "s1", name: "Dev" });
    assert.throws(() => ProjectSectionSchema.parse({ id: "s1", name: "   " }));
    assert.throws(() => ProjectSectionSchema.parse({ id: "s1", name: "x".repeat(61) }));
    assert.throws(() => ProjectSectionSchema.parse({ id: "bad id!", name: "Dev" }));
  });

  test("the wire project carries its sections", () => {
    assert.deepEqual(ProjectWireSchema.parse(wireProject).sections, [{ id: "sec_a", name: "Design" }]);
    const { sections: _omit, ...missing } = wireProject;
    assert.throws(() => ProjectWireSchema.parse(missing));
  });

  test("a new project starts with no sections", () => {
    assert.deepEqual(ProjectCreateBodySchema.parse({ name: "New" }).sections, []);
  });

  test("sections are capped and their ids must be unique", () => {
    const many = Array.from({ length: MAX_SECTIONS_PER_PROJECT + 1 }, (_, i) => ({ id: `s${i}`, name: `G${i}` }));
    assert.equal(ProjectCreateBodySchema.safeParse({ name: "x", sections: many }).success, false);
    const dup = [{ id: "s1", name: "A" }, { id: "s1", name: "B" }];
    assert.equal(ProjectCreateBodySchema.safeParse({ name: "x", sections: dup }).success, false);
  });

  test("a patch can replace the section list on its own, and omitting it leaves it alone", () => {
    const next = [{ id: "s1", name: "Todo" }, { id: "s2", name: "Doing" }];
    assert.deepEqual(ProjectUpdateBodySchema.parse({ sections: next }), { sections: next });
    assert.equal("sections" in ProjectUpdateBodySchema.parse({ name: "Renamed" }), false);
  });
});
