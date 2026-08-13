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
 * A SECOND production failure (Windows desktop build) came from the same
 * rebuild: `DROP TABLE users` performs an implicit row-delete, and libsql
 * enables `PRAGMA foreign_keys` by DEFAULT (unlike better-sqlite3), so on any
 * DB with real child rows (tasks/settings/… → users(id)) that delete tripped
 *   SQLITE_CONSTRAINT: FOREIGN KEY constraint failed  (statementIndex 3)
 * and the backend never started. The rebuild must run with FK enforcement
 * suspended, then restore it.
 *
 * These tests pin the fixes: migrations must (a) survive a pre-existing orphan
 * `users_new` (self-heal), (b) still perform the rebuild correctly, preserving
 * data, and (c) complete the rebuild even when child rows reference the user.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execRaw, query, queryOne } from "../../db/client.js";
import { runMigrations } from "../../db/migrate.js";

/** Recreate the pre-migration legacy `users` schema (email NOT NULL, no username cols). */
async function seedLegacyUsers(): Promise<void> {
  // Drop child tables first: libsql keeps FK enforcement ON, so `DROP TABLE
  // users` while a `tasks` row references it would itself trip the constraint.
  await execRaw("DROP TABLE IF EXISTS tasks");
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

  test("completes the rebuild when child rows reference the user (FK enforcement on)", async () => {
    // libsql defaults `PRAGMA foreign_keys = ON`. Seed a child table with a row
    // pointing at the legacy user so the rebuild's `DROP TABLE users` implicit
    // delete would violate the FK — exactly the Windows desktop boot failure.
    await execRaw("DROP TABLE IF EXISTS tasks");
    await execRaw(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        title_en TEXT NOT NULL,
        quadrant TEXT NOT NULL DEFAULT 'unclassified',
        today INTEGER NOT NULL DEFAULT 0,
        due TEXT,
        duration INTEGER NOT NULL DEFAULT 0,
        pomos_done INTEGER NOT NULL DEFAULT 0,
        pomos_total INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        not_now_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await execRaw(
      "INSERT INTO tasks (id, user_id, title_en) VALUES ('t1', 'u1', 'Ship it')",
    );

    // Before the fix this rejects with SQLITE_CONSTRAINT (FOREIGN KEY).
    await assert.doesNotReject(() => runMigrations());

    // Rebuild happened, and the referencing child row survived intact.
    const email = (await query<{ name: string; notnull: number }>("PRAGMA table_info(users)")).find(
      (c) => c.name === "email",
    );
    assert.equal(email!.notnull, 0, "email must be nullable after rebuild");
    const task = await queryOne<{ user_id: string }>("SELECT user_id FROM tasks WHERE id = 't1'");
    assert.equal(task?.user_id, "u1", "child task row preserved and still points at the user");

    // FK enforcement is restored after the rebuild (it must not leak OFF).
    const fk = await queryOne<{ foreign_keys: number }>("PRAGMA foreign_keys");
    assert.equal(fk?.foreign_keys, 1, "foreign_keys must be re-enabled after the rebuild");
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
