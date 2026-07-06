/**
 * API · Projects
 *   GET / · POST · PATCH /:id · DELETE /:id · POST /migrate
 * Plus cross-user isolation for projects.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo, newUserWithToken } from "../helpers/index.js";

let demoToken = "";

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
});

describe("GET /v1/projects — keyset pagination", () => {
  test("200 → returns a { items, nextCursor } page", async () => {
    const { status, body } = await req("GET", "/v1/projects", { token: demoToken });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items), "items must be an array");
    assert.ok(body.nextCursor === null || typeof body.nextCursor === "string");
  });

  test("400 → malformed cursor is rejected", async () => {
    const { status, body } = await req("GET", "/v1/projects?cursor=%00%00bad", { token: demoToken });
    assert.equal(status, 400);
    assert.equal((body as any).error?.code, "INVALID_CURSOR");
  });

  test("pages through with limit + cursor in created_at ASC order, no dupes/gaps", async () => {
    const { token } = await newUserWithToken();
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { body } = await req("POST", "/v1/projects", {
        token,
        body: { name: `Project ${i}`, color: "cyan" },
      });
      created.push(body.id);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const path: string = cursor
        ? `/v1/projects?limit=2&cursor=${encodeURIComponent(cursor)}`
        : "/v1/projects?limit=2";
      const { status, body } = await req("GET", path, { token });
      assert.equal(status, 200);
      assert.ok(body.items.length <= 2, "page respects the limit");
      for (const p of body.items) seen.push(p.id);
      cursor = body.nextCursor;
      pages += 1;
      assert.ok(pages <= 10, "must terminate");
    } while (cursor);

    assert.equal(seen.length, 5, "every project appears exactly once across pages");
    assert.equal(new Set(seen).size, 5, "no duplicates across pages");
    assert.deepEqual(seen, created, "stable creation order across pages");
  });

  test("limit is capped (over-max does not error)", async () => {
    const { status, body } = await req("GET", "/v1/projects?limit=99999", { token: demoToken });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
  });
});

describe("Projects", () => {
  let projectId = "";

  test("401 → unauthenticated GET /v1/projects", async () => {
    const { status } = await req("GET", "/v1/projects");
    assert.equal(status, 401);
  });

  test("201 → POST creates a project with goals and defaults", async () => {
    const { status, body } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: {
        name: "Launch Lumo",
        category: "Work",
        color: "cyan",
        emoji: "🚀",
        goals: [{ text: "Ship V1", done: false }, { text: "1k users" }],
      },
    });
    assert.equal(status, 201);
    assert.ok(body.id);
    assert.equal(body.name, "Launch Lumo");
    assert.equal(body.category, "Work");
    assert.equal(body.status, "active", "status defaults to active");
    assert.equal(body.goals.length, 2);
    assert.equal(body.goals[0].text, "Ship V1");
    assert.equal(body.goals[1].done, false, "goal done defaults to false");
    assert.equal(body.pinned, false, "pinned defaults to false");
    projectId = body.id;
  });

  test("pinned round-trips through create → GET → PATCH (#211 V2 ⭐6b)", async () => {
    const { status, body } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: { name: "Pinned proj", pinned: true },
    });
    assert.equal(status, 201);
    assert.equal(body.pinned, true);

    const { body: list } = await req("GET", "/v1/projects", { token: demoToken });
    assert.equal((list.items as any[]).find((p) => p.id === body.id)?.pinned, true, "pinned survives GET");

    const { body: patched } = await req("PATCH", `/v1/projects/${body.id}`, {
      token: demoToken,
      body: { pinned: false },
    });
    assert.equal(patched.pinned, false, "unpin persists");

    // A patch that omits pinned must not silently reset it.
    await req("PATCH", `/v1/projects/${body.id}`, { token: demoToken, body: { pinned: true } });
    const { body: renamed } = await req("PATCH", `/v1/projects/${body.id}`, {
      token: demoToken,
      body: { name: "renamed only" },
    });
    assert.equal(renamed.pinned, true, "omitted pinned is preserved");

    await req("DELETE", `/v1/projects/${body.id}`, { token: demoToken });
  });

  test("KPI goal (target/current/unit) round-trips through create → GET", async () => {
    const { status, body } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: {
        name: "Sales project",
        goals: [{ text: "Q3 sales", done: false, target: 100, start: 20, current: 42, unit: "万" }],
      },
    });
    assert.equal(status, 201);
    assert.equal(body.goals[0].target, 100);
    assert.equal(body.goals[0].current, 42);
    assert.equal(body.goals[0].start, 20);
    assert.equal(body.goals[0].unit, "万");

    const { body: list } = await req("GET", "/v1/projects", { token: demoToken });
    const fetched = (list.items as any[]).find((p) => p.id === body.id);
    assert.equal(fetched?.goals[0].target, 100, "KPI target survives GET");
    assert.equal(fetched?.goals[0].current, 42, "KPI current survives GET");
    assert.equal(fetched?.goals[0].start, 20, "KPI start baseline survives GET");
    await req("DELETE", `/v1/projects/${body.id}`, { token: demoToken });
  });

  test("goal confidence (OKR check-in) round-trips + rejects a bad enum", async () => {
    const { status, body } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: {
        name: "OKR project",
        goals: [{ text: "Q3 sales", done: false, target: 100, current: 42, confidence: "at_risk" }],
      },
    });
    assert.equal(status, 201);
    assert.equal(body.goals[0].confidence, "at_risk");

    const { body: list } = await req("GET", "/v1/projects", { token: demoToken });
    const fetched = (list.items as any[]).find((p) => p.id === body.id);
    assert.equal(fetched?.goals[0].confidence, "at_risk", "confidence survives GET");
    await req("DELETE", `/v1/projects/${body.id}`, { token: demoToken });

    const { status: bad } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: { name: "Bad confidence", goals: [{ text: "g", confidence: "maybe" }] },
    });
    assert.equal(bad, 400, "invalid confidence enum is rejected");
  });

  test("400 → POST rejects a missing name", async () => {
    const { status } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: { category: "Work", color: "green" },
    });
    assert.equal(status, 400);
  });

  test("400 → POST rejects an invalid color enum", async () => {
    const { status } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: { name: "Bad color", color: "purple" },
    });
    assert.equal(status, 400);
  });

  test("400 → POST rejects a malformed goals shape", async () => {
    const { status } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: { name: "Bad goals", goals: [{ done: true }] }, // missing required text
    });
    assert.equal(status, 400);
  });

  test("400 → POST rejects an invalid status enum", async () => {
    const { status } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: { name: "Bad status", status: "paused" },
    });
    assert.equal(status, 400);
  });

  test("201 → POST defaults color/status/goals when omitted, round-trips via GET", async () => {
    const { status, body } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: { name: "Minimal" },
    });
    assert.equal(status, 201);
    assert.equal(body.color, "green");
    assert.equal(body.status, "active");
    assert.deepEqual(body.goals, []);
    const list = await req("GET", "/v1/projects", { token: demoToken });
    assert.ok((list.body.items as any[]).some((p) => p.id === body.id));
  });

  test("200 → PATCH updates goals and content", async () => {
    const { status, body } = await req("PATCH", `/v1/projects/${projectId}`, {
      token: demoToken,
      body: { goals: [{ text: "Ship V1", done: true }], content: "{\"doc\":1}" },
    });
    assert.equal(status, 200);
    assert.equal(body.goals.length, 1);
    assert.equal(body.goals[0].done, true);
    assert.equal(body.content, "{\"doc\":1}");
  });

  test("200 → PATCH clears nullable category/emoji/content when sent as null", async () => {
    const { status, body } = await req("PATCH", `/v1/projects/${projectId}`, {
      token: demoToken,
      body: { category: null, emoji: null, content: null },
    });
    assert.equal(status, 200);
    assert.equal(body.category ?? null, null, "category cleared");
    assert.equal(body.emoji ?? null, null, "emoji cleared");
    assert.equal(body.content ?? null, null, "content cleared");
    assert.equal(body.name, "Launch Lumo", "untouched fields preserved");
  });

  test("200 → PATCH archives a project", async () => {
    const { status, body } = await req("PATCH", `/v1/projects/${projectId}`, {
      token: demoToken,
      body: { status: "archived" },
    });
    assert.equal(status, 200);
    assert.equal(body.status, "archived");
  });

  test("404 → PATCH on a non-existent project", async () => {
    const { status } = await req("PATCH", "/v1/projects/prj_missing", {
      token: demoToken,
      body: { name: "Nope" },
    });
    assert.equal(status, 404);
  });

  test("204 → DELETE removes the project", async () => {
    const { status } = await req("DELETE", `/v1/projects/${projectId}`, { token: demoToken });
    assert.equal(status, 204);
    const { body } = await req("GET", "/v1/projects", { token: demoToken });
    assert.equal((body.items as any[]).some((p) => p.id === projectId), false);
  });

  test("404 → DELETE on an already-removed project", async () => {
    const { status } = await req("DELETE", `/v1/projects/${projectId}`, { token: demoToken });
    assert.equal(status, 404);
  });

  test("DELETE cascades — tasks filed under the project are removed, others survive", async () => {
    // Fresh project with a task filed under it, plus a control task with no project.
    const { body: proj } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: { name: "Cascade project", goals: [] },
    });
    const { body: filed } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Filed task" }, project_id: proj.id },
    });
    const { body: control } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Unfiled task" } },
    });

    const { status } = await req("DELETE", `/v1/projects/${proj.id}`, { token: demoToken });
    assert.equal(status, 204);

    const { body: tasks } = await req("GET", "/v1/tasks", { token: demoToken });
    const ids = (tasks.items as any[]).map((t) => t.id);
    assert.equal(ids.includes(filed.id), false, "filed task cascade-deleted");
    assert.equal(ids.includes(control.id), true, "unfiled task survives");
  });

  test("POST /migrate is idempotent — re-running keeps a single row per id", async () => {
    const payload = {
      projects: [
        {
          id: "prj_migrate_1",
          name: "Imported project",
          category: "Personal",
          color: "amber",
          goals: [{ text: "carry over", done: false }],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    assert.equal((await req("POST", "/v1/projects/migrate", { token: demoToken, body: payload })).status, 200);
    assert.equal((await req("POST", "/v1/projects/migrate", { token: demoToken, body: payload })).status, 200);
    const { body } = await req("GET", "/v1/projects", { token: demoToken });
    assert.equal((body.items as any[]).filter((p) => p.id === "prj_migrate_1").length, 1);
  });

  test("400 → POST /migrate rejects an over-cap projects array (bounded bulk import)", async () => {
    const projects = Array.from({ length: 10_001 }, (_, i) => ({
      id: `prj_over_${i}`,
      name: "x",
      color: "amber",
      createdAt: "2026-01-01T00:00:00.000Z",
    }));
    const { status, body } = await req("POST", "/v1/projects/migrate", { token: demoToken, body: { projects } });
    assert.equal(status, 400);
    assert.equal((body as any).error?.code, "VALIDATION_ERROR");
  });
});

describe("Projects — cross-user isolation", () => {
  let otherToken = "";

  before(async () => {
    ({ token: otherToken } = await newUserWithToken("prj-iso"));
  });

  test("user B cannot see, patch, or delete user A's project", async () => {
    const { body: project } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: { name: "A-only project", category: "Secret", color: "green" },
    });

    const { body: bProjects } = await req("GET", "/v1/projects", { token: otherToken });
    assert.equal((bProjects.items as any[]).some((p) => p.id === project.id), false);

    assert.equal(
      (await req("PATCH", `/v1/projects/${project.id}`, { token: otherToken, body: { name: "hijacked" } })).status,
      404,
    );
    assert.equal((await req("DELETE", `/v1/projects/${project.id}`, { token: otherToken })).status, 404);

    const { body: aProjects } = await req("GET", "/v1/projects", { token: demoToken });
    assert.equal((aProjects.items as any[]).some((p) => p.id === project.id), true);
    await req("DELETE", `/v1/projects/${project.id}`, { token: demoToken });
  });
});
