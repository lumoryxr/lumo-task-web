/**
 * API · Migration `updated_at` normalization (F3).
 *
 * The LWW engine and pull cursor compare `updated_at` as raw strings, so EVERY
 * row must end up in the canonical HLC shape (6 fractional digits + 'Z'). This
 * test seeds rows in each LEGACY shape, runs the migration, and asserts:
 *   (a) SQLite datetime space-form  `YYYY-MM-DD HH:MM:SS` → `…T…000000Z`;
 *   (b) 3-fractional-digit ISO      `…326Z`              → `…326000Z`;
 *   (c) already-canonical 6-digit values are left UNTOUCHED;
 *   (d) the normalization is idempotent (re-run = no-op);
 *   (e) a NULL updated_at is backfilled to a value STRICTLY GREATER than MIN_HLC,
 *       so a full pull (since=MIN_HLC, strict `>`) actually returns it.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { setupDb } from "../helpers/index.js";
import { newUserWithToken } from "../helpers/auth.js";
import { execute, queryOne } from "../../db/client.js";
import { runMigrations } from "../../db/migrate.js";
import { pull } from "../../sync/engine.js";
import { MIN_HLC } from "../../lib/hlc.js";

const HLC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
let userId = "";

async function rawUpdatedAt(id: string): Promise<string | null> {
  const row = await queryOne<{ updated_at: string | null }>(
    "SELECT updated_at FROM tasks WHERE id = :id", { id },
  );
  return row?.updated_at ?? null;
}

// Insert a task row with an EXACT updated_at, bypassing the REST path (which
// would stamp an HLC). We write the raw legacy string straight into the column.
async function seedTask(id: string, updatedAt: string | null) {
  await execute(
    `INSERT INTO tasks (id, user_id, title_en, updated_at) VALUES (:id, :uid, :t, :u)`,
    { id, uid: userId, t: `seed ${id}`, u: updatedAt },
  );
}

before(async () => {
  await setupDb();
  ({ userId } = await newUserWithToken("syncmig"));
});

describe("F3 · updated_at normalization", () => {
  test("legacy shapes are converted; canonical is untouched; idempotent", async () => {
    await seedTask("mig-space", "2026-06-26 10:00:00");      // (a) datetime form
    await seedTask("mig-millis", "2026-06-26T10:00:00.326Z"); // (b) 3-digit ISO
    await seedTask("mig-canon", "2026-06-26T10:00:00.326000Z"); // (c) canonical

    await runMigrations();

    assert.equal(await rawUpdatedAt("mig-space"), "2026-06-26T10:00:00.000000Z", "(a) space→canonical");
    assert.equal(await rawUpdatedAt("mig-millis"), "2026-06-26T10:00:00.326000Z", "(b) 3-digit→6-digit");
    assert.equal(await rawUpdatedAt("mig-canon"), "2026-06-26T10:00:00.326000Z", "(c) canonical untouched");
    for (const id of ["mig-space", "mig-millis", "mig-canon"]) {
      assert.match(String(await rawUpdatedAt(id)), HLC_RE);
    }

    // (d) idempotent: a second run must not change any value.
    await runMigrations();
    assert.equal(await rawUpdatedAt("mig-space"), "2026-06-26T10:00:00.000000Z");
    assert.equal(await rawUpdatedAt("mig-millis"), "2026-06-26T10:00:00.326000Z");
    assert.equal(await rawUpdatedAt("mig-canon"), "2026-06-26T10:00:00.326000Z");
  });

  test("NULL updated_at is backfilled ABOVE MIN_HLC and pulls on a full sync", async () => {
    // `people.updated_at` was added by ALTER without a NOT NULL constraint, so it
    // is the realistic table where a legacy row can carry a NULL updated_at.
    await execute(
      `INSERT INTO people (id, user_id, name, initials, color, created_at, updated_at)
       VALUES (:id, :uid, 'Legacy', 'LG', '#fff', '2026-06-26 09:00:00', NULL)`,
      { id: "mig-null-person", uid: userId },
    );
    await runMigrations();

    const row = await queryOne<{ updated_at: string | null }>(
      "SELECT updated_at FROM people WHERE id = :id", { id: "mig-null-person" },
    );
    const backfilled = String(row?.updated_at);
    assert.match(backfilled, HLC_RE);
    assert.ok(backfilled > MIN_HLC, "backfill must be STRICTLY greater than MIN_HLC");

    // The decisive check: a full pull uses strict `updated_at > MIN_HLC`. If the
    // backfill were MIN_HLC itself the row would be invisible forever.
    const { entities } = await pull(userId, MIN_HLC);
    assert.ok(
      entities.people.some((r: any) => r.id === "mig-null-person"),
      "backfilled row must be returned by a full pull (since=MIN_HLC)",
    );
  });
});
