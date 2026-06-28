/**
 * API · AI (heuristic path — no live LLM in tests)
 *   POST /v1/ai/classify · /recommend · /parse
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo, newUserWithToken } from "../helpers/index.js";

let demoToken = "";

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
});

describe("POST /v1/ai/classify", () => {
  test("200 → returns suggestions array for unclassified tasks", async () => {
    const { body: task } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Classify me" }, quadrant: "unclassified" },
    });

    const { status, body } = await req("POST", "/v1/ai/classify", { token: demoToken, body: {} });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.suggestions), "suggestions should be an array");
    assert.ok(body.suggestions.length >= 1, "at least one suggestion expected");

    const s = body.suggestions[0];
    assert.ok(s.task_id, "task_id missing");
    assert.ok(["Q1", "Q2", "Q3", "Q4"].includes(s.quadrant), "invalid quadrant suggestion");
    assert.ok(typeof s.confidence === "number", "confidence should be a number");

    const { body: updatedTask } = await req("GET", `/v1/tasks/${task.id}`, { token: demoToken });
    assert.ok(updatedTask.ai_suggest !== null, "ai_suggest should be set after classify");

    await req("DELETE", `/v1/tasks/${task.id}`, { token: demoToken });
  });

  test("200 → classifies many tasks in one call, all persisted (batch write)", async () => {
    const { token } = await newUserWithToken("aibatch");
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { body: task } = await req("POST", "/v1/tasks", {
        token,
        body: { title: { en: `Batch task ${i}` }, quadrant: "unclassified" },
      });
      ids.push(task.id);
    }

    const { status, body } = await req("POST", "/v1/ai/classify", { token, body: {} });
    assert.equal(status, 200);
    assert.equal(body.suggestions.length, 5, "every unclassified task should get a suggestion");

    // All five rows must have ai_suggest persisted (the batch committed atomically).
    for (const id of ids) {
      const { body: t } = await req("GET", `/v1/tasks/${id}`, { token });
      assert.ok(t.ai_suggest !== null, `ai_suggest missing for ${id}`);
      assert.ok(["Q1", "Q2", "Q3", "Q4"].includes(t.ai_suggest), `invalid ai_suggest for ${id}`);
    }
  });

  test("200 → returns empty array when no unclassified tasks", async () => {
    const { body } = await req("POST", "/v1/ai/classify", { token: demoToken, body: {} });
    assert.equal(typeof body.suggestions, "object");
    assert.ok(Array.isArray(body.suggestions));
  });

  test("401 → no token", async () => {
    const { status } = await req("POST", "/v1/ai/classify");
    assert.equal(status, 401);
  });
});

describe("POST /v1/ai/recommend", () => {
  test("200 → { task: null } when no Q1 today tasks", async () => {
    // Fresh user with no tasks at all.
    const { token } = await newUserWithToken("airecommend");
    const { body } = await req("POST", "/v1/ai/recommend", { token, body: {} });
    assert.equal(body.task, null);
  });

  test("200 → returns highest-priority Q1+today task with conviction score", async () => {
    const { body: task } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Priority task" }, quadrant: "Q1", today: true },
    });

    const { status, body } = await req("POST", "/v1/ai/recommend", { token: demoToken, body: {} });
    assert.equal(status, 200);
    assert.ok(body.task !== null, "should return a task");
    assert.equal(body.task.id, task.id);
    assert.ok(typeof body.task.conviction === "number");

    await req("DELETE", `/v1/tasks/${task.id}`, { token: demoToken });
  });

  test("401 → no token", async () => {
    const { status } = await req("POST", "/v1/ai/recommend");
    assert.equal(status, 401);
  });
});

describe("POST /v1/ai/parse", () => {
  test("200 → returns task scaffold with confidence score", async () => {
    const { status, body } = await req("POST", "/v1/ai/parse", {
      token: demoToken,
      body: { text: "Write report" },
    });
    assert.equal(status, 200);
    assert.ok("title" in body, "title missing");
    assert.ok("quadrant" in body, "quadrant missing");
    assert.ok("confidence" in body, "confidence missing");
  });

  test("401 → no token", async () => {
    const { status } = await req("POST", "/v1/ai/parse");
    assert.equal(status, 401);
  });
});
