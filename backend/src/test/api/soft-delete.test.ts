/**
 * Soft delete (tombstones) — ADR-0003 Phase 1.
 *
 * Deletes on the syncable domains (tasks, completed_entries, people, habits,
 * countdown_events) must NOT physically remove the row: they set `deleted_at`
 * so the deletion can propagate on sync instead of resurrecting. Every normal
 * read must exclude tombstoned rows; the client still sees a delete (GET → 404,
 * list excludes); a repeat delete is a 404; tenant isolation is preserved.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";
import { queryOne } from "../../db/client.js";

async function tombstone(table: string, id: string) {
  return queryOne<{ id: string; deleted_at: string | null }>(
    `SELECT id, deleted_at FROM ${table} WHERE id = :id`,
    { id },
  );
}

let token = "";
let userId = "";

before(async () => {
  await setupDb();
  ({ token, userId } = await newUserWithToken("sd"));
});

describe("Soft delete · tasks", () => {
  test("DELETE keeps the row (deleted_at set), 404s GET, excludes from list, idempotent", async () => {
    const { body: t } = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "Soft me" }, quadrant: "Q1" },
    });

    const del = await req("DELETE", `/v1/tasks/${t.id}`, { token });
    assert.equal(del.status, 204);

    const row = await tombstone("tasks", t.id);
    assert.ok(row, "row must still exist after soft delete");
    assert.ok(row!.deleted_at, "deleted_at must be set");

    assert.equal((await req("GET", `/v1/tasks/${t.id}`, { token })).status, 404);

    const list = await req("GET", "/v1/tasks", { token });
    assert.ok(
      !list.body.items.some((x: any) => x.id === t.id),
      "soft-deleted task must not appear in the list",
    );

    // A second delete sees nothing live → 404 (matches old hard-delete behaviour).
    assert.equal((await req("DELETE", `/v1/tasks/${t.id}`, { token })).status, 404);
  });

  test("soft-deleted tasks are excluded from the user's task count", async () => {
    const u1 = await req("GET", "/v1/user", { token });
    const before = u1.body.stats.tasks as number;

    const { body: t } = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "Counted then deleted" }, quadrant: "Q2" },
    });
    assert.equal((await req("GET", "/v1/user", { token })).body.stats.tasks, before + 1);

    await req("DELETE", `/v1/tasks/${t.id}`, { token });
    assert.equal(
      (await req("GET", "/v1/user", { token })).body.stats.tasks,
      before,
      "count must drop back after soft delete",
    );
  });

  test("a soft-deleted task cannot be completed or patched (404)", async () => {
    const { body: t } = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "Gone" }, quadrant: "Q1" },
    });
    await req("DELETE", `/v1/tasks/${t.id}`, { token });
    assert.equal((await req("POST", `/v1/tasks/${t.id}/complete`, { token })).status, 404);
    assert.equal(
      (await req("PATCH", `/v1/tasks/${t.id}`, { token, body: { title: { en: "zombie" } } })).status,
      404,
    );
  });
});

describe("Soft delete · people / habits / countdowns", () => {
  test("DELETE /people soft-deletes and excludes from list", async () => {
    const { body: p } = await req("POST", "/v1/people", {
      token,
      body: { name: "Temp Person", initials: "TP", color: "#5bc8d4" },
    });
    assert.equal((await req("DELETE", `/v1/people/${p.id}`, { token })).status, 204);
    const row = await tombstone("people", p.id);
    assert.ok(row?.deleted_at, "person deleted_at must be set");
    const list = await req("GET", "/v1/people", { token });
    assert.ok(!list.body.items.some((x: any) => x.id === p.id), "list must exclude soft-deleted person");
    assert.equal((await req("DELETE", `/v1/people/${p.id}`, { token })).status, 404);
  });

  test("DELETE /habits soft-deletes and excludes from list", async () => {
    const { body: h } = await req("POST", "/v1/habits", {
      token,
      body: { title: "Temp habit", color: "green", frequency: "daily" },
    });
    assert.equal((await req("DELETE", `/v1/habits/${h.id}`, { token })).status, 204);
    const row = await tombstone("habits", h.id);
    assert.ok(row?.deleted_at, "habit deleted_at must be set");
    const list = await req("GET", "/v1/habits", { token });
    assert.ok(!list.body.some((x: any) => x.id === h.id), "list must exclude soft-deleted habit");
  });

  test("DELETE /countdowns soft-deletes and excludes from list", async () => {
    const { body: e } = await req("POST", "/v1/countdowns", {
      token,
      body: { title: "Temp event", date: "2026-12-01", color: "cyan", repeat: "none" },
    });
    assert.equal((await req("DELETE", `/v1/countdowns/${e.id}`, { token })).status, 204);
    const row = await tombstone("countdown_events", e.id);
    assert.ok(row?.deleted_at, "countdown deleted_at must be set");
    const list = await req("GET", "/v1/countdowns", { token });
    assert.ok(!list.body.items.some((x: any) => x.id === e.id), "list must exclude soft-deleted countdown");
  });
});

describe("Soft delete · completed entries (reopen tombstones the log)", () => {
  test("reopening a completed task tombstones its completed entry (excluded from the day view)", async () => {
    const { body: t } = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "Finish then reopen" }, quadrant: "Q1" },
    });
    const { body: completed } = await req("POST", `/v1/tasks/${t.id}/complete`, { token });
    const entryId = completed.entry_id as string;

    const reopen = await req("POST", `/v1/completed/${entryId}/reopen`, { token });
    assert.equal(reopen.status, 200);

    const row = await tombstone("completed_entries", entryId);
    assert.ok(row, "completed entry row must still exist (soft delete)");
    assert.ok(row!.deleted_at, "completed entry deleted_at must be set");

    const list = await req("GET", "/v1/completed", { token });
    assert.ok(
      !list.body.items.some((x: any) => x.id === entryId),
      "reopened (tombstoned) entry must not appear in the completed list",
    );
  });
});

describe("Soft delete · tenant isolation", () => {
  test("user B cannot soft-delete user A's task; A's row stays live", async () => {
    const a = await newUserWithToken("sd-a");
    const b = await newUserWithToken("sd-b");
    const { body: t } = await req("POST", "/v1/tasks", {
      token: a.token,
      body: { title: { en: "A owns this" }, quadrant: "Q1" },
    });

    assert.equal((await req("DELETE", `/v1/tasks/${t.id}`, { token: b.token })).status, 404);

    const row = await tombstone("tasks", t.id);
    assert.ok(row && row.deleted_at === null, "A's task must remain live (not tombstoned by B)");
    assert.equal((await req("GET", `/v1/tasks/${t.id}`, { token: a.token })).status, 200);
  });
});
