/**
 * Sync GC + forced full-resync (ADR-0003 Phase 5).
 *
 * Tombstones and idempotency keys are pruned after their retention window.
 * Pruning raises `sync_seq.gc_floor`; a client whose `since` cursor is below the
 * floor may have missed a pruned delete, so the delta endpoint tells it to
 * full-resync.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";
import { query, execute } from "../../db/client.js";
import { runGc, getGcFloor } from "../../lib/gc.js";

let token = "";
let userId = "";

before(async () => {
  await setupDb();
  ({ token, userId } = await newUserWithToken("gc"));
});

async function seqOf(id: string): Promise<number> {
  const rows = await query<{ seq: number }>("SELECT seq FROM tasks WHERE id = :id", { id });
  return Number(rows[0]?.seq);
}

describe("Sync GC · tombstone pruning", () => {
  test("prunes tombstones older than retention, keeps recent ones + live rows, raises gc_floor", async () => {
    const mk = async (title: string) => {
      const { body } = await req("POST", "/v1/tasks", { token, body: { title: { en: title }, quadrant: "Q1" } });
      return body.id as string;
    };
    const oldDel = await mk("old-deleted");
    const recentDel = await mk("recent-deleted");
    const live = await mk("live");

    await req("DELETE", `/v1/tasks/${oldDel}`, { token });
    await req("DELETE", `/v1/tasks/${recentDel}`, { token });
    const oldSeq = await seqOf(oldDel);

    // Backdate the old one's tombstone well past the retention window.
    await execute("UPDATE tasks SET deleted_at = '2000-01-01T00:00:00.000Z' WHERE id = :id", { id: oldDel });

    const res = await runGc({ tombstoneRetentionDays: 90, idempotencyRetentionDays: 7 });
    assert.ok(res.prunedTombstones >= 1, "the old tombstone must be pruned");
    assert.ok(res.gcFloor >= oldSeq, "gc_floor must rise to at least the pruned row's seq");

    // Old tombstone physically gone; recent tombstone + live row remain.
    assert.equal((await query("SELECT id FROM tasks WHERE id = :id", { id: oldDel })).length, 0);
    assert.equal((await query("SELECT id FROM tasks WHERE id = :id", { id: recentDel })).length, 1);
    assert.equal((await query("SELECT id FROM tasks WHERE id = :id", { id: live })).length, 1);
  });
});

describe("Sync GC · idempotency key pruning", () => {
  test("prunes idempotency keys older than retention, keeps recent", async () => {
    await execute(
      "INSERT INTO idempotency_keys (user_id, key, status, response, created_at) VALUES (:u,'old',201,'{}','2000-01-01T00:00:00.000Z')",
      { u: userId },
    );
    await execute(
      "INSERT INTO idempotency_keys (user_id, key, status, response, created_at) VALUES (:u,'fresh',201,'{}',:now)",
      { u: userId, now: new Date().toISOString() },
    );
    const res = await runGc({ idempotencyRetentionDays: 7 });
    assert.ok(res.prunedIdempotencyKeys >= 1);
    assert.equal((await query("SELECT key FROM idempotency_keys WHERE user_id=:u AND key='old'", { u: userId })).length, 0);
    assert.equal((await query("SELECT key FROM idempotency_keys WHERE user_id=:u AND key='fresh'", { u: userId })).length, 1);
  });
});

describe("Sync delta · forced full-resync below GC floor", () => {
  test("since below gc_floor → resyncRequired; since=0 or >=floor → normal", async () => {
    const floor = await getGcFloor();
    assert.ok(floor > 0, "a prior GC should have set a floor");

    // since below the floor → must signal resync, with empty changes.
    const below = await req("GET", `/v1/sync?since=${floor - 1}`, { token });
    assert.equal(below.status, 200);
    assert.equal(below.body.resyncRequired, true);
    assert.equal(below.body.changes.tasks.length, 0);

    // since=0 is already a full snapshot → never a resync signal.
    const full = await req("GET", "/v1/sync?since=0", { token });
    assert.notEqual(full.body.resyncRequired, true);

    // since at/above the floor → normal delta (no resync).
    const above = await req("GET", `/v1/sync?since=${floor}`, { token });
    assert.notEqual(above.body.resyncRequired, true);
  });
});
