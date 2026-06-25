/**
 * Creation idempotency keys (ADR-0003 Phase 3).
 *
 * A client that retries a create after a network timeout sends the same
 * `Idempotency-Key`; the stored result is replayed and NO duplicate row is
 * created. Keys are namespaced per user. Covers all four create endpoints, the
 * no-key / distinct-key paths, per-user isolation, and the in-flight 409.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";
import { query, execute } from "../../db/client.js";

let token = "";
let userId = "";

before(async () => {
  await setupDb();
  ({ token, userId } = await newUserWithToken("idem"));
});

async function countTasks(uid: string): Promise<number> {
  const rows = await query<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE user_id = :u", { u: uid });
  return Number(rows[0]?.n ?? 0);
}

describe("Idempotency · POST /tasks", () => {
  test("same Idempotency-Key replays the result and creates no duplicate", async () => {
    const before = await countTasks(userId);
    const headers = { "Idempotency-Key": "create-task-001" };
    const body = { title: { en: "Idempotent task" }, quadrant: "Q1" };

    const r1 = await req("POST", "/v1/tasks", { token, body, headers });
    const r2 = await req("POST", "/v1/tasks", { token, body, headers });

    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201, "replay returns the original status");
    assert.equal(r2.body.id, r1.body.id, "replay returns the SAME row id");
    assert.equal(await countTasks(userId), before + 1, "exactly one task created despite two requests");
  });

  test("no key → independent creates; different keys → independent creates", async () => {
    const before = await countTasks(userId);
    const body = { title: { en: "x" }, quadrant: "Q1" };

    const a = await req("POST", "/v1/tasks", { token, body });
    const b = await req("POST", "/v1/tasks", { token, body });
    assert.notEqual(a.body.id, b.body.id, "no-key requests create distinct rows");

    const c = await req("POST", "/v1/tasks", { token, body, headers: { "Idempotency-Key": "k-A" } });
    const d = await req("POST", "/v1/tasks", { token, body, headers: { "Idempotency-Key": "k-B" } });
    assert.notEqual(c.body.id, d.body.id, "distinct keys create distinct rows");

    assert.equal(await countTasks(userId), before + 4);
  });

  test("a recent in-flight reservation (no stored result) → 409", async () => {
    // A reservation created just now (within the in-flight TTL) is genuinely
    // concurrent → the second request must not run build().
    await execute(
      "INSERT INTO idempotency_keys (user_id, key, created_at) VALUES (:u, :k, :t)",
      { u: userId, k: "in-flight-1", t: new Date().toISOString() },
    );
    const r = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "blocked" }, quadrant: "Q1" },
      headers: { "Idempotency-Key": "in-flight-1" },
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error?.code, "IDEMPOTENCY_IN_PROGRESS");
  });

  test("a stale reservation (process died mid-request) is reclaimed, not wedged forever", async () => {
    const before = await countTasks(userId);
    // An old reservation with no result — the original request never completed.
    await execute(
      "INSERT INTO idempotency_keys (user_id, key, created_at) VALUES (:u, :k, :t)",
      { u: userId, k: "stale-1", t: "2000-01-01T00:00:00.000Z" },
    );
    const r = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "reclaimed" }, quadrant: "Q1" },
      headers: { "Idempotency-Key": "stale-1" },
    });
    assert.equal(r.status, 201, "a stale reservation must be reclaimable");
    assert.equal(await countTasks(userId), before + 1);
  });

  test("an over-long key is rejected (400)", async () => {
    const r = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "y" }, quadrant: "Q1" },
      headers: { "Idempotency-Key": "x".repeat(201) },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error?.code, "INVALID_IDEMPOTENCY_KEY");
  });
});

describe("Idempotency · per-user namespacing", () => {
  test("the same key string for two users does not collide", async () => {
    const a = await newUserWithToken("idem-a");
    const b = await newUserWithToken("idem-b");
    const key = { "Idempotency-Key": "shared-key" };

    const ra = await req("POST", "/v1/tasks", { token: a.token, body: { title: { en: "A" }, quadrant: "Q1" }, headers: key });
    const rb = await req("POST", "/v1/tasks", { token: b.token, body: { title: { en: "B" }, quadrant: "Q1" }, headers: key });

    assert.equal(ra.status, 201);
    assert.equal(rb.status, 201, "B's identical key must NOT replay A's result");
    assert.notEqual(ra.body.id, rb.body.id);
    assert.equal(await countTasks(a.userId), 1);
    assert.equal(await countTasks(b.userId), 1);
  });
});

describe("Idempotency · other create endpoints", () => {
  test("POST /people / /habits / /countdowns each replay on the same key", async () => {
    const p = { "Idempotency-Key": "p1" };
    const r1 = await req("POST", "/v1/people", { token, headers: p, body: { name: "P", initials: "PP", color: "#5bc8d4" } });
    const r2 = await req("POST", "/v1/people", { token, headers: p, body: { name: "P", initials: "PP", color: "#5bc8d4" } });
    assert.equal(r2.body.id, r1.body.id, "people replay");

    const h = { "Idempotency-Key": "h1" };
    const h1 = await req("POST", "/v1/habits", { token, headers: h, body: { title: "H", color: "green", frequency: "daily" } });
    const h2 = await req("POST", "/v1/habits", { token, headers: h, body: { title: "H", color: "green", frequency: "daily" } });
    assert.equal(h2.body.id, h1.body.id, "habits replay");

    const k = { "Idempotency-Key": "c1" };
    const c1 = await req("POST", "/v1/countdowns", { token, headers: k, body: { title: "C", date: "2026-12-01", color: "cyan", repeat: "none" } });
    const c2 = await req("POST", "/v1/countdowns", { token, headers: k, body: { title: "C", date: "2026-12-01", color: "cyan", repeat: "none" } });
    assert.equal(c2.body.id, c1.body.id, "countdowns replay");
  });
});
