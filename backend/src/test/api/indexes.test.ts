/**
 * Migration · multi-tenant secondary indexes
 *
 * Guards against silent reintroduction of full-table-scan reads: every tenant
 * table must keep a (user_id, …) index after migrations run.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { setupDb } from "../helpers/index.js";
import { query } from "../../db/client.js";

const EXPECTED = [
  "idx_tasks_user_completed_created",
  "idx_tasks_user_completed_quadrant",
  "idx_completed_user_completedat",
  "idx_people_user_created",
  "idx_habits_user_created",
  "idx_habit_logs_user_date",
  "idx_countdowns_user_created",
];

describe("migration: tenant-table indexes", () => {
  before(setupDb);

  test("all expected (user_id, …) indexes exist after migration", async () => {
    const rows = await query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index'",
    );
    const names = new Set(rows.map((r) => r.name));
    for (const idx of EXPECTED) {
      assert.ok(names.has(idx), `missing index ${idx}`);
    }
  });

  test("the hot tasks list query is index-backed (no full scan)", async () => {
    // Matches the live query, which filters soft-deleted rows; the list index is
    // partial (WHERE deleted_at IS NULL), so the predicate must be present to use it.
    const plan = await query<{ detail: string }>(
      "EXPLAIN QUERY PLAN SELECT * FROM tasks WHERE user_id = 'u' AND completed = 0 AND deleted_at IS NULL ORDER BY created_at ASC",
    );
    const text = plan.map((r) => r.detail).join(" | ");
    assert.match(text, /USING INDEX idx_tasks_user_completed_created/i, `plan was: ${text}`);
    assert.doesNotMatch(text, /SCAN tasks(?! USING)/i, `unexpected full scan: ${text}`);
  });

  test("the completed day-view query is tenant-scoped by index (no full scan)", async () => {
    // The query filters DATE(completed_at,'localtime') = ?. SQLite cannot index a
    // non-deterministic 'localtime' expression, so we rely on the user_id-prefixed
    // index to scope the scan to one tenant (the DATE filter is a residual within
    // that tenant) — which is the stated goal: never a full table scan.
    const plan = await query<{ detail: string }>(
      "EXPLAIN QUERY PLAN SELECT * FROM completed_entries WHERE user_id = 'u' AND deleted_at IS NULL AND DATE(completed_at, 'localtime') = '2026-06-24' ORDER BY completed_at ASC",
    );
    const text = plan.map((r) => r.detail).join(" | ");
    assert.match(text, /USING INDEX idx_completed_user_completedat/i, `plan was: ${text}`);
    assert.doesNotMatch(text, /SCAN completed_entries(?! USING)/i, `unexpected full scan: ${text}`);
  });
});
