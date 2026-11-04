/**
 * API · Project sections (custom task groups)
 *   Project `sections` CRUD via POST/PATCH /v1/projects, task `section_id` via
 *   POST/PATCH /v1/tasks, plus the integrity rules that keep the two in step.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { ProjectWireSchema, TaskWireSchema } from "@lumo/contracts";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";

let token = "";
let otherToken = "";

before(async () => {
  await setupDb();
  ({ token } = await newUserWithToken("sections"));
  ({ token: otherToken } = await newUserWithToken("sections-other"));
});

async function newProject(sections: Array<{ id: string; name: string }> = []) {
  const r = await req("POST", "/v1/projects", { token, body: { name: "Grouped", sections } });
  assert.equal(r.status, 201);
  return r.body;
}

describe("project sections", () => {
  test("201 → a new project has no sections by default, contract-conformant", async () => {
    const p = await newProject();
    assert.deepEqual(p.sections, []);
    ProjectWireSchema.parse(p);
  });

  test("201 → sections given on create persist and round-trip in order", async () => {
    const p = await newProject([{ id: "s_design", name: "Design" }, { id: "s_build", name: "Build" }]);
    assert.deepEqual(p.sections.map((s: any) => s.id), ["s_design", "s_build"]);
    const list = await req("GET", "/v1/projects?limit=500", { token });
    const got = list.body.items.find((x: any) => x.id === p.id);
    assert.deepEqual(got.sections, p.sections);
  });

  test("200 → PATCH replaces the list (add, rename, reorder)", async () => {
    const p = await newProject([{ id: "s1", name: "Todo" }]);
    const r = await req("PATCH", `/v1/projects/${p.id}`, {
      token,
      body: { sections: [{ id: "s2", name: "Doing" }, { id: "s1", name: "To do" }] },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.sections, [{ id: "s2", name: "Doing" }, { id: "s1", name: "To do" }]);
    ProjectWireSchema.parse(r.body);
  });

  test("200 → PATCH of another field leaves sections untouched", async () => {
    const p = await newProject([{ id: "s1", name: "Todo" }]);
    const r = await req("PATCH", `/v1/projects/${p.id}`, { token, body: { name: "Renamed" } });
    assert.deepEqual(r.body.sections, [{ id: "s1", name: "Todo" }]);
  });

  test("400 → duplicate section ids are rejected", async () => {
    const r = await req("POST", "/v1/projects", {
      token,
      body: { name: "Dup", sections: [{ id: "a", name: "A" }, { id: "a", name: "B" }] },
    });
    assert.equal(r.status, 400);
  });
});

describe("task section_id", () => {
  test("201 → a task can be created straight into a group", async () => {
    const p = await newProject([{ id: "s_a", name: "A" }]);
    const t = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "In A" }, project_id: p.id, section_id: "s_a" },
    });
    assert.equal(t.status, 201);
    assert.equal(t.body.section_id, "s_a");
    TaskWireSchema.parse(t.body);
  });

  test("201 → a task without a group is ungrouped (null)", async () => {
    const p = await newProject([{ id: "s_a", name: "A" }]);
    const t = await req("POST", "/v1/tasks", { token, body: { title: { en: "Loose" }, project_id: p.id } });
    assert.equal(t.body.section_id, null);
  });

  test("400 INVALID_SECTION → the group must exist in the task's project", async () => {
    const p = await newProject([{ id: "s_a", name: "A" }]);
    const unknown = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "x" }, project_id: p.id, section_id: "s_missing" },
    });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error?.code, "INVALID_SECTION");

    const noProject = await req("POST", "/v1/tasks", { token, body: { title: { en: "x" }, section_id: "s_a" } });
    assert.equal(noProject.status, 400);
    assert.equal(noProject.body.error?.code, "INVALID_SECTION");
  });

  test("400 INVALID_SECTION → another user's project groups are not usable", async () => {
    const theirs = await req("POST", "/v1/projects", {
      token: otherToken,
      body: { name: "Theirs", sections: [{ id: "s_x", name: "X" }] },
    });
    const mine = await newProject();
    const t = await req("POST", "/v1/tasks", { token, body: { title: { en: "x" }, project_id: mine.id } });
    const r = await req("PATCH", `/v1/tasks/${t.body.id}`, {
      token,
      body: { project_id: theirs.body.id, section_id: "s_x" },
    });
    assert.equal(r.status, 400);
  });

  test("200 → PATCH moves a task between groups and out of all groups", async () => {
    const p = await newProject([{ id: "s_a", name: "A" }, { id: "s_b", name: "B" }]);
    const t = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "Mover" }, project_id: p.id, section_id: "s_a" },
    });
    const toB = await req("PATCH", `/v1/tasks/${t.body.id}`, { token, body: { section_id: "s_b" } });
    assert.equal(toB.status, 200);
    assert.equal(toB.body.section_id, "s_b");
    const out = await req("PATCH", `/v1/tasks/${t.body.id}`, { token, body: { section_id: null } });
    assert.equal(out.body.section_id, null);
  });

  test("200 → PATCH of another field keeps the group", async () => {
    const p = await newProject([{ id: "s_a", name: "A" }]);
    const t = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "Stay" }, project_id: p.id, section_id: "s_a" },
    });
    const r = await req("PATCH", `/v1/tasks/${t.body.id}`, { token, body: { today: true } });
    assert.equal(r.body.section_id, "s_a");
  });

  test("200 → moving a task to another project drops its old group", async () => {
    const p1 = await newProject([{ id: "s_a", name: "A" }]);
    const p2 = await newProject([{ id: "s_a2", name: "A2" }]);
    const t = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "Hop" }, project_id: p1.id, section_id: "s_a" },
    });
    const r = await req("PATCH", `/v1/tasks/${t.body.id}`, { token, body: { project_id: p2.id } });
    assert.equal(r.status, 200);
    assert.equal(r.body.section_id, null);
  });

  test("200 → deleting a group ungroups its tasks; other groups are untouched", async () => {
    const p = await newProject([{ id: "s_keep", name: "Keep" }, { id: "s_drop", name: "Drop" }]);
    const kept = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "kept" }, project_id: p.id, section_id: "s_keep" },
    });
    const dropped = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "dropped" }, project_id: p.id, section_id: "s_drop" },
    });
    await req("PATCH", `/v1/projects/${p.id}`, { token, body: { sections: [{ id: "s_keep", name: "Keep" }] } });

    const k = await req("GET", `/v1/tasks/${kept.body.id}`, { token });
    const d = await req("GET", `/v1/tasks/${dropped.body.id}`, { token });
    assert.equal(k.body.section_id, "s_keep");
    assert.equal(d.body.section_id, null);
    assert.ok(d.body.updated_at > dropped.body.updated_at, "ungrouping is a write that syncs");
  });

  test("201 → the next occurrence of a recurring task stays in its group", async () => {
    const p = await newProject([{ id: "s_r", name: "Routine" }]);
    const t = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "Weekly grouped" }, project_id: p.id, section_id: "s_r", recurrence: "weekly" },
    });
    await req("POST", `/v1/tasks/${t.body.id}/complete`, { token, body: {} });
    const list = await req("GET", "/v1/tasks?q=Weekly%20grouped", { token });
    const next = list.body.items.find((x: any) => x.id !== t.body.id);
    assert.ok(next, "next occurrence spawned");
    assert.equal(next.section_id, "s_r");
  });
});
