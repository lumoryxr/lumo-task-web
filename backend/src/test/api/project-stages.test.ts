/**
 * API · Project stages (custom task phases)
 *   Project `stages` via POST/PATCH /v1/projects, task `stage_id` via
 *   POST/PATCH /v1/tasks, plus the integrity rules that keep the two in step.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { ProjectWireSchema, TaskWireSchema } from "@lumo/contracts";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";

let token = "";
let otherToken = "";

const PIPELINE = [
  { id: "stg_plan", name: "Plan" },
  { id: "stg_build", name: "Build" },
  { id: "stg_ship", name: "Ship" },
];

before(async () => {
  await setupDb();
  ({ token } = await newUserWithToken("stages"));
  ({ token: otherToken } = await newUserWithToken("stages-other"));
});

async function newProject(stages: Array<{ id: string; name: string }> = PIPELINE) {
  const r = await req("POST", "/v1/projects", { token, body: { name: "Staged", stages } });
  assert.equal(r.status, 201);
  return r.body;
}

async function newTask(body: Record<string, unknown>) {
  return req("POST", "/v1/tasks", { token, body: { title: { en: "t" }, ...body } });
}

describe("project stages", () => {
  test("201 → a new project has no stages by default, contract-conformant", async () => {
    const r = await req("POST", "/v1/projects", { token, body: { name: "Plain" } });
    assert.deepEqual(r.body.stages, []);
    ProjectWireSchema.parse(r.body);
  });

  test("201 → stages given on create persist in order", async () => {
    const p = await newProject();
    assert.deepEqual(p.stages, PIPELINE);
    const list = await req("GET", "/v1/projects?limit=500", { token });
    assert.deepEqual(list.body.items.find((x: any) => x.id === p.id).stages, PIPELINE);
  });

  test("200 → PATCH replaces the stage list; other fields leave it alone", async () => {
    const p = await newProject();
    const reordered = [PIPELINE[1], PIPELINE[0], PIPELINE[2]];
    const r = await req("PATCH", `/v1/projects/${p.id}`, { token, body: { stages: reordered } });
    assert.deepEqual(r.body.stages, reordered);
    const r2 = await req("PATCH", `/v1/projects/${p.id}`, { token, body: { name: "Renamed" } });
    assert.deepEqual(r2.body.stages, reordered);
    ProjectWireSchema.parse(r2.body);
  });

  test("400 → duplicate stage ids are rejected", async () => {
    const r = await req("POST", "/v1/projects", {
      token,
      body: { name: "Dup", stages: [{ id: "a", name: "A" }, { id: "a", name: "B" }] },
    });
    assert.equal(r.status, 400);
  });
});

describe("task stage_id", () => {
  test("201 → a task can start in a stage; default is no stage", async () => {
    const p = await newProject();
    const staged = await newTask({ project_id: p.id, stage_id: "stg_build" });
    assert.equal(staged.status, 201);
    assert.equal(staged.body.stage_id, "stg_build");
    TaskWireSchema.parse(staged.body);
    const plain = await newTask({ project_id: p.id });
    assert.equal(plain.body.stage_id, null);
  });

  test("400 INVALID_STAGE → the stage must exist in the task's project", async () => {
    const p = await newProject();
    const unknown = await newTask({ project_id: p.id, stage_id: "stg_missing" });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error?.code, "INVALID_STAGE");
    const noProject = await newTask({ stage_id: "stg_plan" });
    assert.equal(noProject.status, 400);
    assert.equal(noProject.body.error?.code, "INVALID_STAGE");
  });

  test("400 INVALID_STAGE → another user's project stages are not usable", async () => {
    const theirs = await req("POST", "/v1/projects", {
      token: otherToken,
      body: { name: "Theirs", stages: [{ id: "stg_x", name: "X" }] },
    });
    const mine = await newProject();
    const t = await newTask({ project_id: mine.id });
    const r = await req("PATCH", `/v1/tasks/${t.body.id}`, {
      token,
      body: { project_id: theirs.body.id, stage_id: "stg_x" },
    });
    assert.equal(r.status, 400);
  });

  test("200 → PATCH advances, clears, and otherwise keeps the stage", async () => {
    const p = await newProject();
    const t = await newTask({ project_id: p.id, stage_id: "stg_plan" });
    const next = await req("PATCH", `/v1/tasks/${t.body.id}`, { token, body: { stage_id: "stg_build" } });
    assert.equal(next.status, 200);
    assert.equal(next.body.stage_id, "stg_build");
    const kept = await req("PATCH", `/v1/tasks/${t.body.id}`, { token, body: { today: true } });
    assert.equal(kept.body.stage_id, "stg_build");
    const cleared = await req("PATCH", `/v1/tasks/${t.body.id}`, { token, body: { stage_id: null } });
    assert.equal(cleared.body.stage_id, null);
  });

  test("200 → moving a task to another project drops its old stage", async () => {
    const p1 = await newProject();
    const p2 = await newProject([{ id: "stg_other", name: "Other" }]);
    const t = await newTask({ project_id: p1.id, stage_id: "stg_ship" });
    const r = await req("PATCH", `/v1/tasks/${t.body.id}`, { token, body: { project_id: p2.id } });
    assert.equal(r.status, 200);
    assert.equal(r.body.stage_id, null);
  });

  test("200 → deleting a stage clears it from its tasks (and syncs); others are untouched", async () => {
    const p = await newProject();
    const inPlan = await newTask({ project_id: p.id, stage_id: "stg_plan" });
    const inShip = await newTask({ project_id: p.id, stage_id: "stg_ship" });
    await req("PATCH", `/v1/projects/${p.id}`, { token, body: { stages: [PIPELINE[0], PIPELINE[1]] } });
    const a = await req("GET", `/v1/tasks/${inPlan.body.id}`, { token });
    const b = await req("GET", `/v1/tasks/${inShip.body.id}`, { token });
    assert.equal(a.body.stage_id, "stg_plan");
    assert.equal(b.body.stage_id, null);
    assert.ok(b.body.updated_at > inShip.body.updated_at, "clearing is a write that syncs");
  });

  test("201 → the next occurrence of a recurring task starts with no stage", async () => {
    const p = await newProject();
    const t = await newTask({
      title: { en: "Weekly staged" }, project_id: p.id, stage_id: "stg_ship", recurrence: "weekly",
    });
    await req("POST", `/v1/tasks/${t.body.id}/complete`, { token, body: {} });
    const list = await req("GET", "/v1/tasks?q=Weekly%20staged", { token });
    const next = list.body.items.find((x: any) => x.id !== t.body.id);
    assert.ok(next, "next occurrence spawned");
    assert.equal(next.stage_id, null);
  });
});
