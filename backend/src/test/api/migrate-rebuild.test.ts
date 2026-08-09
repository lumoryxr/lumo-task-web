/**
 * Regression · migrations are crash-safe & self-healing
 *
 * The `users` table-rebuild migration (make `email` nullable + add username
 * columns) used to be a NON-atomic, NON-idempotent sequence:
 *     CREATE TABLE users_new … ; INSERT … ; DROP TABLE users ; RENAME …
 * run as four separately-auto-committed statements. If the process died
 * mid-rebuild (Render health-check timeout, OOM/SIGKILL, an unrelated early
 * boot failure), it left an orphaned `users_new` table while `users.email`
 * was still NOT NULL — so the guard re-triggered on the next boot and
 * `CREATE TABLE users_new` threw "table users_new already exists", bricking
 * every subsequent deploy. Production hit exactly this:
 *   LibsqlError SQL_INPUT_ERROR: table users_new already exists
 *
 * These tests pin the fix: migrations must (a) survive a pre-existing orphan
 * `users_new` (self-heal), and (b) still perform the rebuild correctly,
 * preserving data.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execRaw, query, queryOne } from "../../db/client.js";
import { runMigrations } from "../../db/migrate.js";

/** Recreate the pre-migration legacy `users` schema (email NOT NULL, no username cols). */
async function seedLegacyUsers(): Promise<void> {
  await execRaw("DROP TABLE IF EXISTS users");
  await execRaw("DROP TABLE IF EXISTS users_new");
  await execRaw(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      local INTEGER NOT NULL DEFAULT 0,
      plan TEXT DEFAULT 'free',
      renews_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await execRaw(
    "INSERT INTO users (id, email, password_hash, name, initials) " +
      "VALUES ('u1', 'alice@example.com', 'hash', 'Alice', 'AL')",
  );
}

describe("users rebuild migration — crash-safe & self-healing", () => {
  beforeEach(async () => {
    await seedLegacyUsers();
  });

  test("recovers from an orphaned `users_new` left by a crashed prior run", async () => {
    // Simulate the half-applied state: a stray users_new from a dead attempt,
    // while `users.email` is still NOT NULL so the rebuild guard re-fires.
    await execRaw("CREATE TABLE users_new (id TEXT PRIMARY KEY)");

    // Before the fix this throws "table users_new already exists".
    await assert.doesNotReject(() => runMigrations());

    // The orphan is gone and the real rebuild happened.
    const leftover = await queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users_new'",
    );
    assert.equal(leftover, undefined, "users_new must not survive migration");

    const cols = await query<{ name: string; notnull: number }>("PRAGMA table_info(users)");
    const email = cols.find((c) => c.name === "email");
    assert.ok(email, "users.email column exists");
    assert.equal(email!.notnull, 0, "email must be nullable after rebuild");
    assert.ok(cols.some((c) => c.name === "username_lower"), "username_lower column added");

    // Data survived the rebuild and the handle was backfilled.
    const row = await queryOne<{ id: string; email: string; username_lower: string | null }>(
      "SELECT id, email, username_lower FROM users WHERE id = 'u1'",
    );
    assert.equal(row?.email, "alice@example.com");
    assert.ok(row?.username_lower, "username_lower backfilled for the migrated user");
  });

  test("is idempotent — a second run is a clean no-op", async () => {
    await runMigrations();
    await assert.doesNotReject(() => runMigrations(), "re-running migrations must not throw");
    const email = (await query<{ name: string; notnull: number }>("PRAGMA table_info(users)")).find(
      (c) => c.name === "email",
    );
    assert.equal(email!.notnull, 0);
  });
});
