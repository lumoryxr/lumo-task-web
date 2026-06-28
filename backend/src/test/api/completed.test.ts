/**
 * API · Completed log
 *   GET /v1/completed · GET ?date= · POST /:id/reopen
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo } from "../helpers/index.js";

let demoToken = "";

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
});

describe("GET /v1/completed", () => {
  test("200 → no date returns a keyset page { items, nextCursor }", async () => {
    const { status, body } = await req("GET", "/v1/completed", { token: demoToken });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items), "items should be an array");
    assert.ok(body.nextCursor === null || typeof body.nextCursor === "string");
  });

  test("200 → date filter returns only entries for that day (array)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { status, body } = await req("GET", `/v1/completed?date=${today}`, { token: demoToken });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
  });

  test("200 → cursor pages through the full history without overlap", async () => {
    // Seed three fresh completed entries so the history has ≥3 rows.
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { body: t } = await req("POST", "/v1/tasks", {
        token: demoToken,
        body: { title: { en: `Paginate me ${i}` }, quadrant: "Q1" },
      });
      await req("POST", `/v1/tasks/${t.id}/complete`, { token: demoToken });
      ids.push(t.id);
    }

    // First page of size 2 must be full and yield a cursor.
    const { body: p1 } = await req("GET", "/v1/completed?limit=2", { token: demoToken });
    assert.equal(p1.items.length, 2);
    assert.equal(typeof p1.nextCursor, "string");

    // Following the cursor returns more rows, none repeating page 1.
    const { body: p2 } = await req("GET", `/v1/completed?limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`, { token: demoToken });
    assert.ok(p2.items.length >= 1);
    const p1ids = new Set(p1.items.map((e: any) => e.id));
    assert.ok(p2.items.every((e: any) => !p1ids.has(e.id)), "pages must not overlap");
  });

  test("400 → malformed cursor", async () => {
    const { status } = await req("GET", "/v1/completed?cursor=%00%00not-valid", { token: demoToken });
    assert.equal(status, 400);
  });

  test("401 → no token", async () => {
    const { status } = await req("GET", "/v1/completed");
    assert.equal(status, 401);
  });
});

describe("POST /v1/completed/:id/reopen", () => {
  test("200 → reopens entry and restores task to active list", async () => {
    const { body: created } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Task to reopen" }, quadrant: "Q1" },
    });
    const { body: completed } = await req("POST", `/v1/tasks/${created.id}/complete`, {
      token: demoToken,
    });
    const entryId = completed.entry_id;

    const { status, body } = await req("POST", `/v1/completed/${entryId}/reopen`, {
      token: demoToken,
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);

    const { body: restored } = await req("GET", `/v1/tasks/${created.id}`, { token: demoToken });
    assert.equal(restored.completed, false, "task should be active again");
    assert.equal(restored.today, true, "task should be flagged for today");

    await req("DELETE", `/v1/tasks/${created.id}`, { token: demoToken });
  });

  test("404 → unknown entry id", async () => {
    const { status } = await req("POST", "/v1/completed/nonexistent-entry/reopen", {
      token: demoToken,
    });
    assert.equal(status, 404);
  });

  test("401 → no token", async () => {
    const { status } = await req("POST", "/v1/completed/some-id/reopen");
    assert.equal(status, 401);
  });
});
