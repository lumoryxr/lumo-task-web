/**
 * API · Focus / Pomodoro
 *   POST /v1/focus/sessions
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo } from "../helpers/index.js";

let demoToken = "";

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
});

describe("POST /v1/focus/sessions", () => {
  test("200 → standalone session (no task_id) returns entry_id", async () => {
    const { status, body } = await req("POST", "/v1/focus/sessions", {
      token: demoToken,
      body: { duration: 25 },
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.ok(body.entry_id, "entry_id missing");
  });

  test("200 → session with task_id increments task pomos_done", async () => {
    const { body: task } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Pomodoro task" }, pomos_total: 4 },
    });
    assert.equal(task.pomos_done, 0, "initial pomos_done should be 0");

    const { status } = await req("POST", "/v1/focus/sessions", {
      token: demoToken,
      body: { task_id: task.id, duration: 25, started_at: new Date().toISOString() },
    });
    assert.equal(status, 200);

    const { body: updated } = await req("GET", `/v1/tasks/${task.id}`, { token: demoToken });
    assert.equal(updated.pomos_done, 1, "pomos_done should increment after focus session");

    await req("DELETE", `/v1/tasks/${task.id}`, { token: demoToken });
  });

  test("200 → focus-session completed entry snapshots the task's tags (Tags V2)", async () => {
    const { body: task } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Tagged pomodoro" }, tags: ["deep", "work"] },
    });
    await req("POST", "/v1/focus/sessions", {
      token: demoToken,
      body: { task_id: task.id, duration: 25 },
    });
    const { body } = await req("GET", "/v1/completed", { token: demoToken });
    const entry = body.items.find((e: { task_id: string | null }) => e.task_id === task.id);
    assert.ok(entry, "focus session should produce a completed entry");
    assert.deepEqual([...entry.tags].sort(), ["deep", "work"], "focus entry must carry the task's tags");

    await req("DELETE", `/v1/tasks/${task.id}`, { token: demoToken });
  });

  test("200 → session with nonexistent task_id is graceful (no crash)", async () => {
    const { status, body } = await req("POST", "/v1/focus/sessions", {
      token: demoToken,
      body: { task_id: "nonexistent-task", duration: 25 },
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });

  test("400 → missing duration", async () => {
    const { status } = await req("POST", "/v1/focus/sessions", {
      token: demoToken,
      body: {},
    });
    assert.equal(status, 400);
  });

  test("400 → duration must be at least 1 minute", async () => {
    const { status } = await req("POST", "/v1/focus/sessions", {
      token: demoToken,
      body: { duration: 0 },
    });
    assert.equal(status, 400);
  });

  // `completed_entries.duration` stores the same kind of value as `tasks.duration`
  // (session length in minutes), which the contract bounds at max 1440 (= 24h).
  // An unbounded focus duration silently poisons Stats totals; reject absurd /
  // overflow-shaped values at the request boundary (#405).
  test("400 → duration above 1440 (24h) is rejected and names the field", async () => {
    const { status, body } = await req("POST", "/v1/focus/sessions", {
      token: demoToken,
      body: { duration: 9_999_999 },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "duration"),
      "the rejection must name `duration`",
    );
  });

  test("400 → oversized duration persists nothing (no entry, no pomos bump)", async () => {
    const { body: task } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Overflow guard" }, pomos_total: 4 },
    });
    const { status } = await req("POST", "/v1/focus/sessions", {
      token: demoToken,
      body: { task_id: task.id, duration: 9_999_999 },
    });
    assert.equal(status, 400);

    const { body: after } = await req("GET", `/v1/tasks/${task.id}`, { token: demoToken });
    assert.equal(after.pomos_done, 0, "a rejected oversized session must not bump pomos_done");
    const { body: completed } = await req("GET", "/v1/completed", { token: demoToken });
    assert.ok(
      !completed.items.some((e: { task_id: string | null }) => e.task_id === task.id),
      "a rejected oversized session must not create a completed entry",
    );

    await req("DELETE", `/v1/tasks/${task.id}`, { token: demoToken });
  });

  test("200 → boundary duration = 1440 (24h) is accepted", async () => {
    const { status, body } = await req("POST", "/v1/focus/sessions", {
      token: demoToken,
      body: { duration: 1440 },
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });

  test("401 → no token", async () => {
    const { status } = await req("POST", "/v1/focus/sessions", {
      body: { duration: 25 },
    });
    assert.equal(status, 401);
  });

  // `started_at` is documented as `format: date-time` (routes/docs.ts) and every
  // other datetime anchor in the app is format-bounded — these guard that the
  // focus-session anchor rejects malformed input at the request boundary (#402).
  test("400 → malformed started_at names the field, never persists", async () => {
    const { status, body } = await req("POST", "/v1/focus/sessions", {
      token: demoToken,
      body: { duration: 25, started_at: "someday" },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "started_at"),
      "the rejection must name `started_at`",
    );
  });

  test("400 → date-only started_at (no time component) is rejected", async () => {
    const { status } = await req("POST", "/v1/focus/sessions", {
      token: demoToken,
      body: { duration: 25, started_at: "2026-07-08" },
    });
    assert.equal(status, 400);
  });

  test("200 → app-form started_at (YYYY-MM-DDTHH:MM) is accepted", async () => {
    const { status } = await req("POST", "/v1/focus/sessions", {
      token: demoToken,
      body: { duration: 25, started_at: "2026-12-01T14:15" },
    });
    assert.equal(status, 200);
  });
});
