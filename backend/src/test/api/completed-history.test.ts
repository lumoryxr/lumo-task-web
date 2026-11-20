/**
 * API · Completed history keeps each task's subtasks
 *   A completed entry snapshots the task's subtasks at the moment it closed, so
 *   the history view can show them even after the task changes or is deleted.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { CompletedListResponseSchema, CompletedDayResponseSchema } from "@lumo/contracts";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";
import { execRaw, queryOne } from "../../db/client.js";
import { runMigrations } from "../../db/migrate.js";

let token = "";

const SUBTASKS = [
  { id: "s1", title: "Draft", completed: true },
  { id: "s2", title: "Review", completed: false },
];

before(async () => {
  await setupDb();
  ({ token } = await newUserWithToken("history"));
});

async function completeTask(body: Record<string, unknown>) {
  const t = await req("POST", "/v1/tasks", { token, body: { title: { en: "History task" }, ...body } });
  await req("POST", `/v1/tasks/${t.body.id}/complete`, { token, body: {} });
  return t.body;
}

async function historyEntryFor(taskId: string) {
  const { body } = await req("GET", "/v1/completed?limit=500", { token });
  CompletedListResponseSchema.parse(body);
  return body.items.find((e: any) => e.task_id === taskId);
}

describe("completed history · subtasks", () => {
  test("a closed task's subtasks appear on its history entry, contract-conformant", async () => {
    const task = await completeTask({ subtasks: SUBTASKS });
    const entry = await historyEntryFor(task.id);
    assert.ok(entry, "entry exists");
    assert.deepEqual(entry.subtasks, SUBTASKS);
  });

  test("the one-day view carries them too", async () => {
    const task = await completeTask({ subtasks: SUBTASKS });
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const { body } = await req("GET", `/v1/completed?date=${date}`, { token });
    CompletedDayResponseSchema.parse(body);
    assert.deepEqual(body.find((e: any) => e.task_id === task.id)?.subtasks, SUBTASKS);
  });

  test("a task without subtasks has an empty list", async () => {
    const task = await completeTask({});
    assert.deepEqual((await historyEntryFor(task.id)).subtasks, []);
  });

  test("the snapshot does not change when the task is edited afterwards", async () => {
    const task = await completeTask({ subtasks: SUBTASKS });
    await req("PATCH", `/v1/tasks/${task.id}`, {
      token,
      body: { subtasks: [{ id: "s9", title: "Added later", completed: false }] },
    });
    assert.deepEqual((await historyEntryFor(task.id)).subtasks, SUBTASKS);
  });

  test("the snapshot survives the task being deleted", async () => {
    const task = await completeTask({ subtasks: SUBTASKS });
    await req("DELETE", `/v1/tasks/${task.id}`, { token });
    assert.deepEqual((await historyEntryFor(task.id))?.subtasks, SUBTASKS);
  });
});

describe("completed history · migration backfill", () => {
  test("entries created before the snapshot column get their task's subtasks", async () => {
    const task = await completeTask({ subtasks: SUBTASKS });
    // Simulate a database from before the column existed.
    await execRaw("ALTER TABLE completed_entries DROP COLUMN subtasks_json");
    await runMigrations();
    const row = await queryOne<{ subtasks_json: string }>(
      "SELECT subtasks_json FROM completed_entries WHERE task_id = :id",
      { id: task.id },
    );
    assert.deepEqual(JSON.parse(row!.subtasks_json), SUBTASKS);
    // An entry whose task is gone (or had none) is left empty, not failed.
    const loose = await completeTask({});
    assert.deepEqual((await historyEntryFor(loose.id)).subtasks, []);
  });
});

describe("completed history · per-project view", () => {
  test("?project_id narrows the history to one project, contract-conformant", async () => {
    const p1 = await req("POST", "/v1/projects", { token, body: { name: "Alpha" } });
    const p2 = await req("POST", "/v1/projects", { token, body: { name: "Beta" } });
    const a = await completeTask({ title: { en: "In alpha" }, project_id: p1.body.id });
    const b = await completeTask({ title: { en: "In beta" }, project_id: p2.body.id });
    const r = await req("GET", `/v1/completed?project_id=${p1.body.id}&limit=50`, { token });
    assert.equal(r.status, 200);
    CompletedListResponseSchema.parse(r.body);
    const ids = r.body.items.map((e: any) => e.task_id);
    assert.ok(ids.includes(a.id));
    assert.ok(!ids.includes(b.id));
    assert.ok(r.body.items.every((e: any) => e.project_id === p1.body.id));
  });

  test("the project filter pages with the cursor", async () => {
    const p = await req("POST", "/v1/projects", { token, body: { name: "Paged" } });
    for (let i = 0; i < 3; i++) await completeTask({ title: { en: `Paged ${i}` }, project_id: p.body.id });
    const first = await req("GET", `/v1/completed?project_id=${p.body.id}&limit=2`, { token });
    assert.equal(first.body.items.length, 2);
    assert.ok(first.body.nextCursor);
    const second = await req("GET", `/v1/completed?project_id=${p.body.id}&limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`, { token });
    assert.equal(second.body.items.length, 1);
    assert.equal(second.body.nextCursor, null);
  });

  test("400 → a malformed project id is rejected", async () => {
    const r = await req("GET", "/v1/completed?project_id=bad%20id", { token });
    assert.equal(r.status, 400);
  });
});

describe("completed history · subtask assignees", () => {
  test("a subtask's assignee is kept in the history snapshot", async () => {
    const subtasks = [{ id: "s1", title: "Draft", completed: true, assignee_id: "p_ann" }];
    const task = await completeTask({ subtasks });
    assert.deepEqual((await historyEntryFor(task.id)).subtasks, subtasks);
  });
});
