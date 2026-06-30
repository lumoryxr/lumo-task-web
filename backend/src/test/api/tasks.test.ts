/**
 * API · Tasks
 *   GET /v1/tasks · POST · GET /:id · PATCH /:id · DELETE /:id
 *   POST /:id/complete · /uncomplete
 *
 * Happy-path + validation (400) + not-found (404) + auth (401), plus
 * @lumo/contracts conformance on every task-shaped response.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { TaskWireSchema, TaskCompleteResponseSchema } from "@lumo/contracts";
import { req, setupDb, signInDemo, newUserWithToken } from "../helpers/index.js";

let demoToken = "";
let taskId = ""; // reused across the CRUD flow within this file

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
});

describe("GET /v1/tasks", () => {
  test("200 → paginated envelope of incomplete tasks", async () => {
    const { status, body } = await req("GET", "/v1/tasks", { token: demoToken });
    assert.equal(status, 200);
    // Contract: { items, nextCursor } envelope (ADR-0001 / #47).
    assert.ok(Array.isArray(body.items));
    assert.ok("nextCursor" in body);
    for (const t of body.items) assert.equal(t.completed, false);
    // Contract conformance: every item must match the @lumo/contracts wire shape.
    for (const t of body.items) TaskWireSchema.parse(t);
  });

  test("401 → no token", async () => {
    const { status } = await req("GET", "/v1/tasks");
    assert.equal(status, 401);
  });
});

describe("GET /v1/tasks?q= (keyword search)", () => {
  // A unique marker keeps these fixtures from colliding with seeded demo tasks.
  const M = "Zqx";
  before(async () => {
    await req("POST", "/v1/tasks", { token: demoToken, body: { title: { en: `${M} apricot report` } } });
    await req("POST", "/v1/tasks", { token: demoToken, body: { title: { en: `${M} banana memo` } } });
    await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: `${M} plain` }, desc: { en: "hidden apricot inside notes" } },
    });
  });

  test("200 → filters by title keyword, contract-conformant", async () => {
    const { status, body } = await req("GET", `/v1/tasks?q=${M}%20apricot`, { token: demoToken });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
    const titles = body.items.map((t: any) => t.title.en);
    assert.ok(titles.includes(`${M} apricot report`), "title match missing");
    assert.ok(!titles.includes(`${M} banana memo`), "non-match leaked");
    for (const t of body.items) TaskWireSchema.parse(t);
  });

  test("200 → matches description (notes), both columns searched", async () => {
    const { status, body } = await req("GET", "/v1/tasks?q=apricot", { token: demoToken });
    assert.equal(status, 200);
    const titles = body.items.map((t: any) => t.title.en);
    assert.ok(titles.includes(`${M} apricot report`), "title hit missing");
    assert.ok(titles.includes(`${M} plain`), "desc hit missing");
  });

  test("200 → keyword is case-insensitive", async () => {
    const { status, body } = await req("GET", "/v1/tasks?q=APRICOT", { token: demoToken });
    assert.equal(status, 200);
    assert.ok(body.items.some((t: any) => t.title.en === `${M} apricot report`));
  });

  test("200 → no match returns empty page", async () => {
    const { status, body } = await req("GET", "/v1/tasks?q=nonexistentkeyword999", { token: demoToken });
    assert.equal(status, 200);
    assert.deepEqual(body.items, []);
    assert.equal(body.nextCursor, null);
  });

  test("200 → LIKE wildcard in input is treated literally (not a pattern)", async () => {
    // "%" would match everything if not escaped; expect zero literal-% matches.
    const { status, body } = await req("GET", "/v1/tasks?q=%25%25%25", { token: demoToken });
    assert.equal(status, 200);
    assert.deepEqual(body.items, []);
  });

  test("400 → q over max length is rejected at the boundary", async () => {
    const { status } = await req("GET", `/v1/tasks?q=${"a".repeat(201)}`, { token: demoToken });
    assert.equal(status, 400);
  });
});

describe("POST /v1/tasks", () => {
  test("201 → minimal task (title only)", async () => {
    const { status, body } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Minimal task" } },
    });
    assert.equal(status, 201);
    assert.equal(body.title.en, "Minimal task");
    assert.equal(body.quadrant, "unclassified");
    assert.equal(body.today, false);
    assert.equal(body.completed, false);
    assert.ok(body.id, "id missing");
  });

  test("201 → full task with all optional fields", async () => {
    const { status, body } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: {
        title: { en: "Full task", zh: "完整任务" },
        desc: { en: "A description", zh: "描述" },
        quadrant: "Q1",
        today: true,
        due: "2099-12-31",
        duration: 90,
        pomos_total: 4,
        conviction: 0.9,
        next_step: { en: "Next action", zh: "下一步" },
        reason: { en: "Because reasons", zh: "因为" },
        ai_suggest: "Q1",
        not_now: [{ id: "other-task", reason: { en: "Not now", zh: "不行" } }],
      },
    });
    assert.equal(status, 201);
    assert.equal(body.title.zh, "完整任务");
    assert.equal(body.quadrant, "Q1");
    assert.equal(body.today, true);
    assert.equal(body.conviction, 0.9);
    assert.equal(body.next_step?.en, "Next action");
    assert.equal(body.not_now.length, 1);
    // Contract conformance: the POST response must match the wire contract.
    TaskWireSchema.parse(body);
    taskId = body.id; // save for subsequent tests
  });

  test("400 → missing title field", async () => {
    const { status } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { quadrant: "Q1" },
    });
    assert.equal(status, 400);
  });

  test("400 → invalid quadrant value", async () => {
    const { status } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Bad quadrant" }, quadrant: "Q5" },
    });
    assert.equal(status, 400);
  });

  test("401 → no token", async () => {
    const { status } = await req("POST", "/v1/tasks", {
      body: { title: { en: "Unauthorized" } },
    });
    assert.equal(status, 401);
  });
});

describe("task tags", () => {
  test("201 → create with tags persists and round-trips on GET", async () => {
    const { status, body } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Tagged" }, tags: ["work", "urgent"] },
    });
    assert.equal(status, 201);
    assert.deepEqual(body.tags, ["work", "urgent"]);
    TaskWireSchema.parse(body);

    const got = await req("GET", `/v1/tasks/${body.id}`, { token: demoToken });
    assert.deepEqual(got.body.tags, ["work", "urgent"]);
  });

  test("201 → tags default to [] when omitted", async () => {
    const { status, body } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Untagged" } },
    });
    assert.equal(status, 201);
    assert.deepEqual(body.tags, []);
  });

  test("200 → PATCH replaces the tag set", async () => {
    const created = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Retag me" }, tags: ["old"] },
    });
    const { status, body } = await req("PATCH", `/v1/tasks/${created.body.id}`, {
      token: demoToken,
      body: { tags: ["fresh", "home"] },
    });
    assert.equal(status, 200);
    assert.deepEqual(body.tags, ["fresh", "home"]);
  });

  test("200 → PATCH without tags leaves the existing set untouched", async () => {
    const created = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Keep tags" }, tags: ["keep"] },
    });
    const { body } = await req("PATCH", `/v1/tasks/${created.body.id}`, {
      token: demoToken,
      body: { today: true },
    });
    assert.deepEqual(body.tags, ["keep"]);
  });

  test("201 → tags are trimmed; 400 when a tag exceeds the length cap", async () => {
    const trimmed = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Trim" }, tags: ["  spaced  "] },
    });
    assert.deepEqual(trimmed.body.tags, ["spaced"]);

    const tooLong = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Too long" }, tags: ["x".repeat(31)] },
    });
    assert.equal(tooLong.status, 400);
  });
});

describe("GET /v1/tasks/:id", () => {
  test("200 → returns single task by id", async () => {
    const { status, body } = await req("GET", `/v1/tasks/${taskId}`, { token: demoToken });
    assert.equal(status, 200);
    assert.equal(body.id, taskId);
    assert.equal(body.title.en, "Full task");
    TaskWireSchema.parse(body); // contract conformance
  });

  test("404 → unknown id", async () => {
    const { status } = await req("GET", "/v1/tasks/nonexistent-task-id", { token: demoToken });
    assert.equal(status, 404);
  });

  test("401 → no token", async () => {
    const { status } = await req("GET", `/v1/tasks/${taskId}`);
    assert.equal(status, 401);
  });
});

describe("PATCH /v1/tasks/:id", () => {
  test("200 → partial update preserves untouched fields", async () => {
    const { status, body } = await req("PATCH", `/v1/tasks/${taskId}`, {
      token: demoToken,
      body: { quadrant: "Q2", today: false },
    });
    assert.equal(status, 200);
    assert.equal(body.quadrant, "Q2");
    assert.equal(body.today, false);
    assert.equal(body.title.en, "Full task", "title should be unchanged");
    TaskWireSchema.parse(body); // contract conformance
  });

  test("200 → can clear optional fields with null", async () => {
    const { status, body } = await req("PATCH", `/v1/tasks/${taskId}`, {
      token: demoToken,
      body: { desc: null, conviction: null },
    });
    assert.equal(status, 200);
    assert.equal(body.desc, null);
    assert.equal(body.conviction, null);
  });

  test("200 → can update not_now array", async () => {
    const { status, body } = await req("PATCH", `/v1/tasks/${taskId}`, {
      token: demoToken,
      body: { not_now: [] },
    });
    assert.equal(status, 200);
    assert.deepEqual(body.not_now, []);
  });

  test("404 → unknown id", async () => {
    const { status } = await req("PATCH", "/v1/tasks/nonexistent-task-id", {
      token: demoToken,
      body: { quadrant: "Q3" },
    });
    assert.equal(status, 404);
  });

  test("401 → no token", async () => {
    const { status } = await req("PATCH", `/v1/tasks/${taskId}`, {
      body: { quadrant: "Q3" },
    });
    assert.equal(status, 401);
  });
});

describe("POST /v1/tasks/:id/complete", () => {
  test("200 → marks task complete and creates completed_entry", async () => {
    const { status, body } = await req("POST", `/v1/tasks/${taskId}/complete`, {
      token: demoToken,
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.ok(body.entry_id, "entry_id missing");
    TaskCompleteResponseSchema.parse(body); // contract conformance

    // Task should no longer appear in the active list
    const { body: tasks } = await req("GET", "/v1/tasks", { token: demoToken });
    assert.equal((tasks.items as any[]).find((t: any) => t.id === taskId), undefined,
      "completed task should not appear in active list");
  });

  test("404 → completing an unknown task", async () => {
    const { status: s2 } = await req("POST", "/v1/tasks/nonexistent-id/complete", {
      token: demoToken,
    });
    assert.equal(s2, 404);
  });

  test("401 → no token", async () => {
    const { status } = await req("POST", `/v1/tasks/${taskId}/complete`);
    assert.equal(status, 401);
  });
});

describe("POST /v1/tasks/:id/uncomplete", () => {
  test("200 → restores task to active list", async () => {
    // taskId is currently completed from the previous suite
    const { status, body } = await req("POST", `/v1/tasks/${taskId}/uncomplete`, {
      token: demoToken,
    });
    assert.equal(status, 200);
    assert.equal(body.id, taskId);
    assert.equal(body.completed, false);

    const { body: tasks } = await req("GET", "/v1/tasks", { token: demoToken });
    assert.ok((tasks.items as any[]).find((t: any) => t.id === taskId), "task should be back in active list");
  });

  test("404 → task is not completed (or doesn't exist)", async () => {
    const { status } = await req("POST", `/v1/tasks/${taskId}/uncomplete`, {
      token: demoToken,
    });
    assert.equal(status, 404);
  });

  test("401 → no token", async () => {
    const { status } = await req("POST", `/v1/tasks/${taskId}/uncomplete`);
    assert.equal(status, 401);
  });
});

describe("DELETE /v1/tasks/:id", () => {
  test("204 → deletes task", async () => {
    const { body: created } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "To be deleted" } },
    });
    const { status } = await req("DELETE", `/v1/tasks/${created.id}`, { token: demoToken });
    assert.equal(status, 204);

    const { status: s } = await req("GET", `/v1/tasks/${created.id}`, { token: demoToken });
    assert.equal(s, 404, "deleted task should not be found");
  });

  test("404 → unknown id", async () => {
    const { status } = await req("DELETE", "/v1/tasks/nonexistent-id", { token: demoToken });
    assert.equal(status, 404);
  });

  test("401 → no token", async () => {
    const { status } = await req("DELETE", `/v1/tasks/${taskId}`);
    assert.equal(status, 401);
  });
});

describe("task remind_at (per-task reminder)", () => {
  test("create persists remind_at; PATCH updates and clears it", async () => {
    const remindAt = "2026-09-01T09:30";
    const { status, body: created } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Reminder task" }, remind_at: remindAt },
    });
    assert.equal(status, 201);
    assert.equal(created.remind_at, remindAt, "remind_at should persist on create");

    const upd = await req("PATCH", `/v1/tasks/${created.id}`, {
      token: demoToken,
      body: { remind_at: "2026-09-02T18:00" },
    });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.remind_at, "2026-09-02T18:00", "remind_at should update");

    const cleared = await req("PATCH", `/v1/tasks/${created.id}`, {
      token: demoToken,
      body: { remind_at: null },
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.remind_at, null, "remind_at should clear to null");
  });

  test("defaults to null when omitted, and a PATCH without remind_at preserves it", async () => {
    const { body: created } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "No reminder" } },
    });
    assert.equal(created.remind_at, null);

    const withReminder = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Keep reminder" }, remind_at: "2026-10-10T10:00" },
    });
    const patched = await req("PATCH", `/v1/tasks/${withReminder.body.id}`, {
      token: demoToken,
      body: { title: { en: "Renamed" } },
    });
    assert.equal(patched.body.remind_at, "2026-10-10T10:00", "an unrelated PATCH must not drop remind_at");
  });

  test("rejects a malformed remind_at → 400", async () => {
    const { status } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Bad reminder" }, remind_at: "not-a-datetime" },
    });
    assert.equal(status, 400);
  });
});

describe("task ↔ project linkage (#213)", () => {
  let projectId = "";

  before(async () => {
    const { body } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: { name: "Owner Project", color: "cyan" },
    });
    projectId = body.id;
  });

  test("201 → create with a valid owned project_id persists and round-trips", async () => {
    const { status, body } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Filed" }, project_id: projectId },
    });
    assert.equal(status, 201);
    assert.equal(body.project_id, projectId);
    const got = await req("GET", `/v1/tasks/${body.id}`, { token: demoToken });
    assert.equal(got.body.project_id, projectId);
  });

  test("201 → project_id defaults to null when omitted", async () => {
    const { status, body } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Unfiled" } },
    });
    assert.equal(status, 201);
    assert.equal(body.project_id ?? null, null);
  });

  test("400 → create with a non-existent project_id is rejected", async () => {
    const { status, body } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Bad project" }, project_id: "prj_does_not_exist" },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "INVALID_PROJECT");
  });

  test("400 → create cannot reference another tenant's project (IDOR guard)", async () => {
    const { token: otherToken } = await newUserWithToken("prj-link-iso");
    const { body: theirs } = await req("POST", "/v1/projects", {
      token: otherToken,
      body: { name: "Their Project", color: "green" },
    });
    const { status } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Steal" }, project_id: theirs.id },
    });
    assert.equal(status, 400, "must not allow filing a task into another user's project");
  });

  test("200 → PATCH sets then clears project_id (null)", async () => {
    const created = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Move me" } },
    });
    const set = await req("PATCH", `/v1/tasks/${created.body.id}`, {
      token: demoToken,
      body: { project_id: projectId },
    });
    assert.equal(set.status, 200);
    assert.equal(set.body.project_id, projectId);

    const cleared = await req("PATCH", `/v1/tasks/${created.body.id}`, {
      token: demoToken,
      body: { project_id: null },
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.project_id ?? null, null);
  });

  test("400 → PATCH cannot move a task into another tenant's project", async () => {
    const { token: otherToken } = await newUserWithToken("prj-link-iso2");
    const { body: theirs } = await req("POST", "/v1/projects", {
      token: otherToken,
      body: { name: "Their Project 2", color: "amber" },
    });
    const created = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Move attempt" } },
    });
    const { status } = await req("PATCH", `/v1/tasks/${created.body.id}`, {
      token: demoToken,
      body: { project_id: theirs.id },
    });
    assert.equal(status, 400);
  });

  test("200 → an unrelated PATCH preserves project_id", async () => {
    const created = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Keep project" }, project_id: projectId },
    });
    const { body } = await req("PATCH", `/v1/tasks/${created.body.id}`, {
      token: demoToken,
      body: { title: { en: "Renamed" } },
    });
    assert.equal(body.project_id, projectId, "an unrelated PATCH must not drop project_id");
  });
});
