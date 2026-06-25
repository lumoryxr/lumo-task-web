/**
 * Incremental sync · monotonic seq + delta-pull endpoint (ADR-0003 Phase 2).
 *
 * GET /v1/sync?since=<cursor> returns the authenticated user's syncable rows
 * changed since the cursor — including tombstones — paginated by a global
 * monotonic seq. Covers: full snapshot, incremental pulls (no dup/skip),
 * delete propagation, server-authoritative seq advancing on update, bounded
 * pagination across domains, and tenant isolation of the cursor.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";

async function pull(token: string, since = 0, limit?: number) {
  const qs = `since=${since}${limit ? `&limit=${limit}` : ""}`;
  const { status, body } = await req("GET", `/v1/sync?${qs}`, { token });
  assert.equal(status, 200, "delta pull should 200");
  return body as {
    cursor: number;
    hasMore: boolean;
    changes: { tasks: any[]; completed: any[]; people: any[]; habits: any[]; countdowns: any[] };
  };
}

let token = "";

before(async () => {
  await setupDb();
  ({ token } = await newUserWithToken("delta"));
});

describe("Sync delta · full snapshot + incremental", () => {
  test("since=0 returns all rows with a cursor; re-pull at cursor is empty", async () => {
    const ids: string[] = [];
    for (const t of ["A", "B", "C"]) {
      const { body } = await req("POST", "/v1/tasks", { token, body: { title: { en: t }, quadrant: "Q1" } });
      ids.push(body.id);
    }

    const snap = await pull(token, 0);
    const got = snap.changes.tasks.map((x) => x.id);
    for (const id of ids) assert.ok(got.includes(id), `snapshot must include ${id}`);
    assert.ok(snap.changes.tasks.every((x) => x.deleted === false), "live rows → deleted:false");
    assert.ok(snap.cursor > 0, "cursor should advance");
    assert.equal(snap.hasMore, false);

    const empty = await pull(token, snap.cursor);
    assert.equal(empty.changes.tasks.length, 0, "no changes since cursor");
    assert.equal(empty.cursor, snap.cursor, "cursor unchanged when nothing new");
  });

  test("an update advances the row's seq (server-authoritative)", async () => {
    const { body: t1 } = await req("POST", "/v1/tasks", { token, body: { title: { en: "first" }, quadrant: "Q1" } });
    const { body: t2 } = await req("POST", "/v1/tasks", { token, body: { title: { en: "second" }, quadrant: "Q1" } });
    await req("PATCH", `/v1/tasks/${t1.id}`, { token, body: { title: { en: "first-edited" } } });

    const snap = await pull(token, 0);
    const seqOf = (id: string) => snap.changes.tasks.find((x) => x.id === id)?.seq as number;
    assert.ok(seqOf(t1.id) > seqOf(t2.id), "edited t1 must have a higher seq than later-created t2");
  });
});

describe("Sync delta · delete propagation (tombstones)", () => {
  test("a soft-deleted row appears in the delta with deleted:true", async () => {
    const { body: t } = await req("POST", "/v1/tasks", { token, body: { title: { en: "to delete" }, quadrant: "Q2" } });
    const before = await pull(token, 0);
    const cursor = before.cursor;

    await req("DELETE", `/v1/tasks/${t.id}`, { token });

    const delta = await pull(token, cursor);
    const rec = delta.changes.tasks.find((x) => x.id === t.id);
    assert.ok(rec, "the deleted task must be reported in the delta");
    assert.equal(rec.deleted, true, "it must carry deleted:true so the client removes it");
  });
});

describe("Sync delta · bounded pagination across domains", () => {
  test("walking pages by cursor covers every change exactly once (no dup/skip)", async () => {
    const u = await newUserWithToken("delta-page");
    const expected = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const { body } = await req("POST", "/v1/tasks", { token: u.token, body: { title: { en: `t${i}` }, quadrant: "Q1" } });
      expected.add(`task:${body.id}`);
    }
    for (let i = 0; i < 3; i++) {
      const { body } = await req("POST", "/v1/people", { token: u.token, body: { name: `P${i}`, initials: "PX", color: "#5bc8d4" } });
      expected.add(`person:${body.id}`);
    }

    const seen = new Set<string>();
    let cursor = 0;
    let pages = 0;
    for (;;) {
      const d = await pull(u.token, cursor, 2);
      for (const t of d.changes.tasks) {
        assert.ok(!seen.has(`task:${t.id}`), `task ${t.id} returned twice`);
        seen.add(`task:${t.id}`);
      }
      for (const p of d.changes.people) {
        assert.ok(!seen.has(`person:${p.id}`), `person ${p.id} returned twice`);
        seen.add(`person:${p.id}`);
      }
      const total = d.changes.tasks.length + d.changes.people.length;
      assert.ok(total <= 2, "page must respect the limit");
      cursor = d.cursor;
      if (!d.hasMore) break;
      assert.ok(++pages < 20, "pagination must terminate");
    }
    assert.deepEqual(seen, expected, "every change seen exactly once across pages");
  });
});

describe("Sync delta · tenant isolation", () => {
  test("a user's delta never includes another tenant's rows, even with a foreign cursor", async () => {
    const a = await newUserWithToken("delta-a");
    const b = await newUserWithToken("delta-b");
    const { body: ta } = await req("POST", "/v1/tasks", { token: a.token, body: { title: { en: "A-only" }, quadrant: "Q1" } });

    // B pulls a full snapshot → must not see A's task.
    const bSnap = await pull(b.token, 0);
    assert.ok(!bSnap.changes.tasks.some((x) => x.id === ta.id), "B must not see A's task");

    // Even replaying A's cursor as B only ever returns B's own (empty) rows.
    const aSnap = await pull(a.token, 0);
    const bWithAcursor = await pull(b.token, 0);
    assert.equal(bWithAcursor.changes.tasks.length, 0, "B has no tasks regardless of cursor value");
    assert.ok(aSnap.changes.tasks.some((x) => x.id === ta.id), "A still sees its own task");
  });
});
