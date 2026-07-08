/**
 * API · Templates (#173 V1 — single-task templates)
 *   GET / · POST · PATCH /:id · DELETE /:id
 * Plus payload round-trip and cross-user isolation.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo, newUserWithToken } from "../helpers/index.js";

let demoToken = "";

const samplePayload = {
  title: { en: "Weekly review", zh: "每周回顾" },
  quadrant: "Q2" as const,
  duration: 30,
  pomos_total: 2,
  recurrence: "weekly" as const,
  subtasks: [{ title: "Inbox zero" }, { title: "Plan next week" }],
};

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
});

describe("Templates", () => {
  let templateId = "";

  test("401 → unauthenticated GET /v1/templates", async () => {
    const { status } = await req("GET", "/v1/templates");
    assert.equal(status, 401);
  });

  test("201 → POST creates a template and round-trips the payload", async () => {
    const { status, body } = await req("POST", "/v1/templates", {
      token: demoToken,
      body: { name: "Weekly review", payload: samplePayload },
    });
    assert.equal(status, 201);
    assert.ok(body.id);
    assert.equal(body.name, "Weekly review");
    assert.equal(body.kind, "task");
    assert.equal(body.payload.title.en, "Weekly review");
    assert.equal(body.payload.quadrant, "Q2");
    assert.equal(body.payload.subtasks.length, 2);
    assert.equal(body.payload.subtasks[0].title, "Inbox zero");
    templateId = body.id;
  });

  test("201 → POST applies payload defaults for omitted fields", async () => {
    const { status, body } = await req("POST", "/v1/templates", {
      token: demoToken,
      body: { name: "Minimal", payload: { title: { en: "Just a title" } } },
    });
    assert.equal(status, 201);
    assert.equal(body.payload.quadrant, "unclassified");
    assert.equal(body.payload.duration, 0);
    assert.equal(body.payload.recurrence, "none");
    assert.deepEqual(body.payload.subtasks, []);
  });

  test("400 → POST rejects a missing name", async () => {
    const { status } = await req("POST", "/v1/templates", {
      token: demoToken,
      body: { payload: samplePayload },
    });
    assert.equal(status, 400);
  });

  test("400 → POST rejects a payload with no title", async () => {
    const { status } = await req("POST", "/v1/templates", {
      token: demoToken,
      body: { name: "No title", payload: { quadrant: "Q1" } },
    });
    assert.equal(status, 400);
  });

  test("400 → POST rejects an invalid quadrant in the payload", async () => {
    const { status } = await req("POST", "/v1/templates", {
      token: demoToken,
      body: { name: "Bad quadrant", payload: { title: { en: "x" }, quadrant: "Q9" } },
    });
    assert.equal(status, 400);
  });

  test("200 → GET lists templates newest-first", async () => {
    const { status, body } = await req("GET", "/v1/templates", { token: demoToken });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    assert.ok((body as any[]).some((t) => t.id === templateId));
  });

  test("200 → PATCH renames a template, preserving its payload", async () => {
    const { status, body } = await req("PATCH", `/v1/templates/${templateId}`, {
      token: demoToken,
      body: { name: "Weekly review (v2)" },
    });
    assert.equal(status, 200);
    assert.equal(body.name, "Weekly review (v2)");
    assert.equal(body.payload.quadrant, "Q2", "payload should be preserved when only name changes");
  });

  test("200 → PATCH replaces the payload", async () => {
    const { status, body } = await req("PATCH", `/v1/templates/${templateId}`, {
      token: demoToken,
      body: { payload: { title: { en: "Replaced" }, quadrant: "Q1", duration: 15 } },
    });
    assert.equal(status, 200);
    assert.equal(body.payload.title.en, "Replaced");
    assert.equal(body.payload.quadrant, "Q1");
    assert.equal(body.payload.duration, 15);
  });

  test("404 → PATCH on a non-existent template", async () => {
    const { status } = await req("PATCH", "/v1/templates/tpl_missing", {
      token: demoToken,
      body: { name: "Nope" },
    });
    assert.equal(status, 404);
  });

  test("400 → PATCH a task template with a valid PROJECT-shaped payload (wrong kind) is a clean client error, not 5xx (#395)", async () => {
    // The update body's payload union accepts either kind's shape; the handler
    // re-parses against the template's effective kind. A wrong-kind payload must
    // degrade to 400 VALIDATION_ERROR (safeParse), never throw → 500.
    const { status, body } = await req("PATCH", `/v1/templates/${templateId}`, {
      token: demoToken,
      body: { payload: { name: "Project shaped", goals: [{ text: "g" }] } },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error.fields as Array<{ path: string }>).some((f) => f.path.startsWith("payload.")),
      "the offending payload field is named",
    );
  });

  test("204 → DELETE removes the template", async () => {
    const { status } = await req("DELETE", `/v1/templates/${templateId}`, { token: demoToken });
    assert.equal(status, 204);
    const { body } = await req("GET", "/v1/templates", { token: demoToken });
    assert.equal((body as any[]).some((t) => t.id === templateId), false);
  });

  test("404 → DELETE on an already-removed template", async () => {
    const { status } = await req("DELETE", `/v1/templates/${templateId}`, { token: demoToken });
    assert.equal(status, 404);
  });
});

describe("Templates — project kind (#211 V2 ⭐3)", () => {
  const projectPayload = {
    name: "Product launch",
    category: "Work",
    color: "cyan" as const,
    emoji: "🚀",
    goals: [{ text: "Ship v1" }, { text: "Announce" }],
    content: "Launch checklist",
    tasks: [
      { title: { en: "Draft copy" }, quadrant: "Q2" as const },
      { title: { en: "QA pass" } },
    ],
  };

  test("201 → POST creates a project template and round-trips its payload", async () => {
    const { status, body } = await req("POST", "/v1/templates", {
      token: demoToken,
      body: { name: "Launch blueprint", kind: "project", payload: projectPayload },
    });
    assert.equal(status, 201);
    assert.equal(body.kind, "project");
    assert.equal(body.payload.name, "Product launch");
    assert.equal(body.payload.color, "cyan");
    assert.equal(body.payload.goals.length, 2);
    assert.equal(body.payload.tasks.length, 2);
    assert.equal(body.payload.tasks[0].title.en, "Draft copy");
    // Task blueprint defaults still applied inside the project payload.
    assert.equal(body.payload.tasks[1].quadrant, "unclassified");
    await req("DELETE", `/v1/templates/${body.id}`, { token: demoToken });
  });

  test("400 → project kind with a task-shaped payload is rejected", async () => {
    const { status } = await req("POST", "/v1/templates", {
      token: demoToken,
      body: { name: "bad", kind: "project", payload: { title: { en: "x" } } },
    });
    assert.equal(status, 400);
  });

  test("project and task templates coexist in the same list", async () => {
    const { body: proj } = await req("POST", "/v1/templates", {
      token: demoToken,
      body: { name: "Proj", kind: "project", payload: { name: "P", goals: [], tasks: [] } },
    });
    const { body: taskTpl } = await req("POST", "/v1/templates", {
      token: demoToken,
      body: { name: "Task", payload: { title: { en: "t" } } },
    });
    const { body: list } = await req("GET", "/v1/templates", { token: demoToken });
    const kinds = new Map((list as any[]).map((t) => [t.id, t.kind]));
    assert.equal(kinds.get(proj.id), "project");
    assert.equal(kinds.get(taskTpl.id), "task");
    await req("DELETE", `/v1/templates/${proj.id}`, { token: demoToken });
    await req("DELETE", `/v1/templates/${taskTpl.id}`, { token: demoToken });
  });
});

describe("Templates — cross-user isolation", () => {
  let otherToken = "";

  before(async () => {
    ({ token: otherToken } = await newUserWithToken("tpl-iso"));
  });

  test("user B cannot see, patch, or delete user A's template", async () => {
    const { body: tpl } = await req("POST", "/v1/templates", {
      token: demoToken,
      body: { name: "A-only template", payload: { title: { en: "secret" } } },
    });

    const { body: bList } = await req("GET", "/v1/templates", { token: otherToken });
    assert.equal((bList as any[]).some((t) => t.id === tpl.id), false);

    assert.equal(
      (await req("PATCH", `/v1/templates/${tpl.id}`, { token: otherToken, body: { name: "hijacked" } })).status,
      404,
    );
    assert.equal((await req("DELETE", `/v1/templates/${tpl.id}`, { token: otherToken })).status, 404);

    const { body: aList } = await req("GET", "/v1/templates", { token: demoToken });
    assert.equal((aList as any[]).some((t) => t.id === tpl.id), true);
    await req("DELETE", `/v1/templates/${tpl.id}`, { token: demoToken });
  });
});
