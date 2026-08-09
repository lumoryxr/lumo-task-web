/**
 * Standards · account-deletion completeness (GDPR right-to-erasure)
 *
 * Invariant: EVERY table that carries a `user_id` column must be walked by the
 * account-deletion cascade (`USER_SCOPED_TABLES` in routes/user.ts). Otherwise a
 * new per-user domain silently leaves orphaned personal data behind when a user
 * deletes their account — a real privacy/compliance gap.
 *
 * This turns "remember to add your new table to the delete list" into an
 * executable guard: it introspects the real migrated schema and fails if any
 * `user_id` table is missing from the list.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { runMigrations } from "../../db/migrate.js";
import { query } from "../../db/client.js";
import { USER_SCOPED_TABLES } from "../../routes/user.js";

describe("account-deletion covers every user-scoped table", () => {
  before(async () => {
    await runMigrations();
  });

  test("every table with a user_id column is in USER_SCOPED_TABLES", async () => {
    const tables = await query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    const listed = new Set<string>(USER_SCOPED_TABLES as readonly string[]);
    const missing: string[] = [];

    for (const { name } of tables) {
      const cols = await query<{ name: string }>(`PRAGMA table_info(${name})`);
      const hasUserId = cols.some((c) => c.name === "user_id");
      if (hasUserId && !listed.has(name)) missing.push(name);
    }

    assert.deepEqual(
      missing,
      [],
      `Tables with a user_id column but missing from USER_SCOPED_TABLES (account ` +
        `deletion would orphan their rows): ${missing.join(", ")}`,
    );
  });

  test("USER_SCOPED_TABLES has no stale entries (every listed table exists and is user-scoped)", async () => {
    for (const name of USER_SCOPED_TABLES) {
      const cols = await query<{ name: string }>(`PRAGMA table_info(${name})`);
      assert.ok(cols.length > 0, `listed table "${name}" does not exist`);
      assert.ok(
        cols.some((c) => c.name === "user_id"),
        `listed table "${name}" has no user_id column`,
      );
    }
  });
});
