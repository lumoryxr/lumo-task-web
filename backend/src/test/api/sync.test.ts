/**
 * API · Generic sync round-trip, LWW, tombstones, cursor, migrations.
 *
 * Maps to:
 *   AC2 — generic round-trip: push then pull echoes for MULTIPLE entities, with
 *         zero per-entity handler code (the manifest drives it).
 *   AC3 — LWW: older HLC rejected, newer wins, order-independent.
 *   AC4 — tombstone, no resurrection.
 *   AC5 — cursor: `since` filters; idempotent re-push.
 *   AC8 — migrations run idempotently on an existing DB.
 *
 * Rows are built with explicit NOT-NULL columns (the sync transport binds any
 * omitted manifest column to NULL, so required columns must be supplied).
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb } from "../helpers/index.js";
import { newUserWithToken } from "../helpers/auth.js";
import { now } from "../../lib/hlc.js";
import { runMigrations } from "../../db/migrate.js";
import { app } from "../../app.js";

let token = "";

/** POST /v1/sync/pull with a RAW (unstringified) body — used to send malformed
 *  or empty bodies the JSON-encoding `req()` helper can't express. */
async function fetchRawPull(rawBody: string) {
  const res = await app.request("/v1/sync/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: rawBody,
  });
  let body: any;
  try { body = await res.json(); } catch { body = await res.text(); }
  return { status: res.status, body };
}

// Sync rows carry the FULL column set, exactly as a desktop client reads them
// from its own SQLite (every column present). The engine binds only the columns
// a row actually carries, so an omitted column with a SQLite DEFAULT falls to its
// default on insert (see the "omitted defaulted column" test below) rather than
// being NULL-bound.
function taskRow(id: string, titleEn: string, updatedAt: string, extra: Record<string, unknown> = {}) {
  return {
    id, user_id: "ignored-by-server", title_en: titleEn, updated_at: updatedAt,
    assignee_ids: "[]", not_now_json: "[]", subtasks_json: "[]",
    quadrant: "unclassified", today: 0, duration: 0, pomos_done: 0, pomos_total: 0,
    completed: 0, recurrence: "none", week_focus: 0, created_at: updatedAt, ...extra,
  };
}
function personRow(id: string, name: string, updatedAt: string, extra: Record<string, unknown> = {}) {
  return {
    id, user_id: "ignored", name, initials: name.slice(0, 2), color: "#00ff00",
    created_at: updatedAt, updated_at: updatedAt, ...extra,
  };
}
function countdownRow(id: string, title: string, updatedAt: string, extra: Record<string, unknown> = {}) {
  return {
    id, user_id: "ignored", title, date: "2099-01-01", color: "green",
    repeat: "none", created_at: updatedAt, updated_at: updatedAt, ...extra,
  };
}

async function pull(since?: string) {
  return req("POST", "/v1/sync/pull", { token, body: since ? { since } : {} });
}
async function push(entities: Record<string, unknown[]>) {
  return req("POST", "/v1/sync/push", { token, body: { entities } });
}

before(async () => {
  await setupDb();
  ({ token } = await newUserWithToken("sync"));
});

describe("AC2 · generic round-trip across multiple entities", () => {
  test("push then pull echoes rows for tasks, people, countdown_events", async () => {
    const t = now();
    const res = await push({
      tasks: [taskRow("ac2-task", "Round trip", t)],
      people: [personRow("ac2-person", "Alice", t)],
      countdown_events: [countdownRow("ac2-cd", "Launch", t)],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.applied, 3);

    const { status, body } = await pull();
    assert.equal(status, 200);
    const ids = (tbl: string) => body.entities[tbl].map((r: any) => r.id);
    assert.ok(ids("tasks").includes("ac2-task"));
    assert.ok(ids("people").includes("ac2-person"));
    assert.ok(ids("countdown_events").includes("ac2-cd"));
    // Pull echoes the SAME fields back.
    const task = body.entities.tasks.find((r: any) => r.id === "ac2-task");
    assert.equal(task.title_en, "Round trip");
  });

  test("pull response carries an entry for every manifest entity", async () => {
    const { body } = await pull();
    for (const tbl of ["tasks", "people", "completed_entries", "habits", "countdown_events"]) {
      assert.ok(Array.isArray(body.entities[tbl]), `missing entity ${tbl}`);
    }
  });
});

describe("AC3 · LWW conflict resolution", () => {
  test("newer HLC wins; older HLC is a no-op (forward order)", async () => {
    const t1 = now();
    await push({ tasks: [taskRow("ac3-fwd", "v1", t1)] });
    const t2 = now();
    const r2 = await push({ tasks: [taskRow("ac3-fwd", "v2", t2)] });
    assert.equal(r2.body.applied, 1, "newer write applies");

    // Re-push the older value — must be rejected (no-op).
    const rOld = await push({ tasks: [taskRow("ac3-fwd", "v1-again", t1)] });
    assert.equal(rOld.body.applied, 0, "older write is a no-op");

    const { body } = await pull();
    const row = body.entities.tasks.find((r: any) => r.id === "ac3-fwd");
    assert.equal(row.title_en, "v2", "row converges to newer value");
  });

  test("order-independent: applying older AFTER newer still converges to newer", async () => {
    const t1 = now();
    const t2 = now();
    // Apply the NEWER one first, then the older.
    await push({ tasks: [taskRow("ac3-rev", "newer", t2)] });
    const rOld = await push({ tasks: [taskRow("ac3-rev", "older", t1)] });
    assert.equal(rOld.body.applied, 0);
    const { body } = await pull();
    const row = body.entities.tasks.find((r: any) => r.id === "ac3-rev");
    assert.equal(row.title_en, "newer");
  });
});

describe("AC4 · tombstone, no resurrection", () => {
  test("a delete at t2 is not resurrected by a stale update at t1", async () => {
    const t1 = now();
    await push({ tasks: [taskRow("ac4", "alive", t1)] });
    const t2 = now();
    // Tombstone: deleted_at set, updated_at advanced.
    await push({ tasks: [taskRow("ac4", "alive", t2, { deleted_at: t2 })] });

    // Stale update with t1 < t2 — must NOT revive the row.
    const rStale = await push({ tasks: [taskRow("ac4", "revived", t1)] });
    assert.equal(rStale.body.applied, 0, "stale update must be a no-op");

    const { body } = await pull();
    const row = body.entities.tasks.find((r: any) => r.id === "ac4");
    assert.ok(row, "pull returns the tombstone so peers converge to deleted");
    assert.ok(row.deleted_at, "row remains tombstoned");
    assert.equal(row.title_en, "alive", "title not overwritten by stale update");
  });
});

describe("AC5 · cursor & idempotent resume", () => {
  test("pull(since=cursor) returns only rows changed after the cursor", async () => {
    const tA = now();
    await push({ people: [personRow("ac5-a", "Before", tA)] });
    const first = await pull();
    const cursor = first.body.cursor;

    const tB = now();
    await push({ people: [personRow("ac5-b", "After", tB)] });

    const second = await pull(cursor);
    const ids = second.body.entities.people.map((r: any) => r.id);
    assert.ok(ids.includes("ac5-b"), "row after cursor returned");
    assert.ok(!ids.includes("ac5-a"), "row at/before cursor filtered out");
  });

  test("re-pushing the same batch is idempotent (cursor stable, no dup rows)", async () => {
    const t = now();
    const batch = { people: [personRow("ac5-idem", "Idem", t)] };
    const r1 = await push(batch);
    const r2 = await push(batch); // equal HLC re-applies same values, still counts as applied
    // Both report a cursor equal to the row's HLC; the stored row is unchanged.
    assert.equal(r1.body.cursor, t);
    assert.equal(r2.body.cursor, t);
    const { body } = await pull();
    const matches = body.entities.people.filter((r: any) => r.id === "ac5-idem");
    assert.equal(matches.length, 1, "no duplicate row from re-push");
  });

  test("empty pull echoes the since cursor", async () => {
    const future = "2999-01-01T00:00:00.000000Z";
    const { body } = await pull(future);
    assert.equal(body.cursor, future);
    for (const tbl of Object.keys(body.entities)) {
      assert.equal(body.entities[tbl].length, 0);
    }
  });
});

describe("AC8 · migrations idempotent", () => {
  test("runMigrations twice in a row does not throw", async () => {
    await runMigrations();
    await runMigrations();
    // people & completed_entries gained updated_at.
    const { body } = await pull();
    assert.ok(Array.isArray(body.entities.completed_entries));
  });
});

// ── F4 · per-entity schemas reject missing NOT NULL columns as a 400 ──────────
describe("F4 · push validates required NOT NULL columns (400, not 500)", () => {
  test("a task row missing title_en → 400 INVALID_ROW, nothing applied", async () => {
    const t = now();
    // Same as taskRow() but with title_en deliberately omitted.
    const bad = {
      id: "f4-missing-title", user_id: "ignored", updated_at: t,
      assignee_ids: "[]", not_now_json: "[]", subtasks_json: "[]",
      quadrant: "unclassified", today: 0, duration: 0, pomos_done: 0, pomos_total: 0,
      completed: 0, recurrence: "none", week_focus: 0, created_at: t,
    };
    const res = await push({ tasks: [bad] });
    assert.equal(res.status, 400, "missing NOT NULL column is a clean client error");
    assert.equal(res.body.error?.code, "INVALID_ROW");

    // Nothing was applied — the row does not surface in a pull.
    const { body } = await pull();
    assert.ok(!body.entities.tasks.some((r: any) => r.id === "f4-missing-title"));
  });

  test("a person row missing name → 400 INVALID_ROW", async () => {
    const t = now();
    const bad = {
      id: "f4-missing-name", user_id: "ignored", updated_at: t, created_at: t,
      initials: "XX", color: "#00ff00",
    };
    const res = await push({ people: [bad] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, "INVALID_ROW");
  });

  test("validate-all-then-apply: ONE bad row fails the whole batch, zero applied", async () => {
    const t = now();
    const good = taskRow("f4-good-with-bad", "Valid", t);
    const bad = { id: "f4-bad", user_id: "ignored", updated_at: t }; // no title_en
    const res = await push({ tasks: [good, bad] });
    assert.equal(res.status, 400, "any invalid row rejects the entire batch");

    // The GOOD row in the same batch must NOT have been applied.
    const { body } = await pull();
    assert.ok(
      !body.entities.tasks.some((r: any) => r.id === "f4-good-with-bad"),
      "no partial commit — the valid sibling row was not written",
    );
  });
});

// ── F5 · pull malformed-JSON consistency ──────────────────────────────────────
describe("F5 · pull malformed JSON → 400 (not a silent full resync)", () => {
  test("malformed JSON body → 400 INVALID_JSON", async () => {
    const bad = await fetchRawPull("{ not json ");
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error?.code, "INVALID_JSON");
  });

  test("absent/empty body is still valid → full resync (since=MIN_HLC)", async () => {
    const empty = await fetchRawPull("");
    assert.equal(empty.status, 200, "empty body defaults to a full resync");
    assert.ok(Array.isArray(empty.body.entities.tasks));
  });
});

// ── Review round 2 · engine omits absent columns → DB default, no 500 ──────────
describe("engine binds only present columns (omitted defaulted column → default, not 500)", () => {
  test("a task row omitting defaulted columns succeeds and the defaults apply", async () => {
    const t = now();
    // Minimal row: only the schema-required title_en + the four-tuple. Every other
    // NOT NULL column (quadrant, assignee_ids, …) has a SQLite DEFAULT and is
    // omitted — the engine must leave them out of the INSERT so the default fires,
    // NOT bind NULL (which used to 500 on the NOT NULL constraint).
    const r = await push({ tasks: [{ id: "minimal-task", user_id: "x", title_en: "Bare", updated_at: t }] });
    assert.equal(r.status, 200, "omitting defaulted columns must not 500");
    assert.equal(r.body.applied, 1);

    const got = (await pull()).body.entities.tasks.find((x: any) => x.id === "minimal-task");
    assert.ok(got, "row round-trips");
    assert.equal(got.quadrant, "unclassified", "DB default applied for omitted column");
    assert.equal(got.assignee_ids, "[]", "DB default applied for omitted column");
  });

  test("completed_entries round-trips (previously untested entity), completed_at defaults when omitted", async () => {
    const t = now();
    const r = await push({
      completed_entries: [
        { id: "ce-1", user_id: "x", title_en: "Did a thing", duration: 25, updated_at: t },
      ],
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.applied, 1);

    const got = (await pull()).body.entities.completed_entries.find((x: any) => x.id === "ce-1");
    assert.ok(got, "completed_entry round-trips through push→pull");
    assert.equal(got.title_en, "Did a thing");
    assert.ok(got.completed_at, "omitted completed_at fell to its DB default, not NULL");
  });
});
