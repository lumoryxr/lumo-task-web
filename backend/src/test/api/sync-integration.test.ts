/**
 * API · END-TO-END sync integration (the gap the unit tests missed).
 *
 * The unit `sync.test.ts` pushes synthetic rows straight at the sync engine, so
 * it never exercised the REAL write paths (`POST /v1/tasks`, `/v1/people`, etc.)
 * feeding the pull endpoint. That left the core bug invisible: REST writes stamped
 * `updated_at` with `new Date().toISOString()` (3 fractional digits) instead of the
 * 6-digit HLC, so real rows sorted wrong against synced rows — and people /
 * completed_entries didn't maintain `updated_at` at all.
 *
 * This file drives the genuine REST endpoints, then pulls, asserting:
 *   F1/F2 — every created/updated/deleted row (incl. the people tombstone) comes
 *           back through pull;
 *   F1    — every returned `updated_at` is the canonical 6-digit HLC shape and is
 *           strictly ordered (the cursor advances);
 *   F6    — a second pull at the cursor returns nothing new until another REST
 *           write happens, after which ONLY the changed row returns.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb } from "../helpers/index.js";
import { newUserWithToken } from "../helpers/auth.js";
import { MIN_HLC } from "../../lib/hlc.js";

let token = "";

// The canonical HLC shape: `YYYY-MM-DDTHH:MM:SS.ffffffZ` — exactly 6 fractional
// digits, 'T' separator, trailing 'Z'. This is what the LWW/cursor string compare
// relies on; a 3-digit ISO value (the old bug) would fail this.
const HLC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

async function pull(since?: string) {
  return req("POST", "/v1/sync/pull", { token, body: since ? { since } : {} });
}

before(async () => {
  await setupDb();
  ({ token } = await newUserWithToken("syncint"));
});

describe("F6 · REST write → sync pull end-to-end", () => {
  test("created/updated/completed/deleted rows all surface in pull with canonical HLC, strictly ordered", async () => {
    // ── Create a task and a person via the REAL endpoints ──────────────────────
    const taskRes = await req("POST", "/v1/tasks", {
      token, body: { title: { en: "Write the report" }, quadrant: "Q1" },
    });
    assert.equal(taskRes.status, 201);
    const taskId = taskRes.body.id;

    const personRes = await req("POST", "/v1/people", {
      token, body: { name: "Alice", initials: "AL", color: "#5bc8d4" },
    });
    assert.equal(personRes.status, 201);
    const personId = personRes.body.id;

    // ── Update both ────────────────────────────────────────────────────────────
    assert.equal((await req("PATCH", `/v1/tasks/${taskId}`, {
      token, body: { title: { en: "Write the FINAL report" } },
    })).status, 200);
    assert.equal((await req("PATCH", `/v1/people/${personId}`, {
      token, body: { name: "Alice B." },
    })).status, 200);

    // ── Complete the task (→ a completed_entry) ────────────────────────────────
    const complete = await req("POST", `/v1/tasks/${taskId}/complete`, { token });
    assert.equal(complete.status, 200);
    const entryId = complete.body.entry_id;

    // ── Soft-delete the person (→ a tombstone that must propagate) ──────────────
    assert.equal((await req("DELETE", `/v1/people/${personId}`, { token })).status, 204);

    // ── Full pull (since defaults to MIN_HLC) ──────────────────────────────────
    const { status, body } = await pull();
    assert.equal(status, 200);

    const taskRow = body.entities.tasks.find((r: any) => r.id === taskId);
    const personRow = body.entities.people.find((r: any) => r.id === personId);
    const entryRow = body.entities.completed_entries.find((r: any) => r.id === entryId);

    // F1/F2 — every row came back through pull.
    assert.ok(taskRow, "task surfaces in pull");
    assert.ok(personRow, "person surfaces in pull");
    assert.ok(entryRow, "completed_entry surfaces in pull");

    // F1/F2 — the updates are reflected (REST write actually advanced the row).
    assert.equal(taskRow.title_en, "Write the FINAL report");
    assert.equal(taskRow.completed, 1);
    assert.equal(personRow.name, "Alice B.");

    // F2 — the people tombstone propagates: deleted_at set, still returned.
    assert.ok(personRow.deleted_at, "deleted person is a tombstone (deleted_at set)");

    // F1 — EVERY returned updated_at is the canonical 6-digit HLC shape. This is
    // the exact assertion that would have caught the original bug.
    for (const tbl of Object.keys(body.entities)) {
      for (const row of body.entities[tbl]) {
        assert.match(
          String(row.updated_at), HLC_RE,
          `${tbl}#${row.id} updated_at must be canonical 6-digit HLC, got ${row.updated_at}`,
        );
      }
    }

    // F1 — the cursor strictly advances past MIN_HLC and is itself a valid HLC,
    // and equals the max updated_at across all returned rows (strict ordering).
    assert.match(body.cursor, HLC_RE);
    assert.ok(body.cursor > MIN_HLC, "cursor advanced past the epoch");
    let maxSeen = MIN_HLC;
    for (const tbl of Object.keys(body.entities)) {
      for (const row of body.entities[tbl]) {
        if (String(row.updated_at) > maxSeen) maxSeen = String(row.updated_at);
      }
    }
    assert.equal(body.cursor, maxSeen, "cursor is the high-watermark of all rows");
  });

  test("a second pull at the cursor is empty until another REST write, then returns only that row", async () => {
    // Snapshot the current high-watermark.
    const first = await pull();
    const cursor = first.body.cursor;

    // Pull again at the cursor — strict `> since` means nothing new.
    const second = await pull(cursor);
    for (const tbl of Object.keys(second.body.entities)) {
      assert.equal(second.body.entities[tbl].length, 0, `${tbl} empty at cursor`);
    }
    assert.equal(second.body.cursor, cursor, "empty pull echoes the cursor");

    // Now do ONE more REST write.
    const cd = await req("POST", "/v1/countdowns", {
      token, body: { title: "Launch", date: "2099-01-01", color: "green", repeat: "none" },
    });
    assert.equal(cd.status, 201);

    // Pull at the old cursor — ONLY the new row returns.
    const third = await pull(cursor);
    assert.deepEqual(
      third.body.entities.countdown_events.map((r: any) => r.id), [cd.body.id],
      "only the newly written row returns",
    );
    for (const tbl of ["tasks", "people", "completed_entries", "habits"]) {
      assert.equal(third.body.entities[tbl].length, 0, `${tbl} unchanged → empty`);
    }
    assert.match(third.body.entities.countdown_events[0].updated_at, HLC_RE);
    assert.ok(third.body.cursor > cursor, "cursor advanced after the new write");
  });
});
