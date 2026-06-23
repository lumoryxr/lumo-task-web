/**
 * Security · The backend seeds no account in any environment
 *
 * There is no default/demo user: running the migrations (the only DB bootstrap
 * the server performs at startup) must create ZERO users. Any account is created
 * solely through the public registration API. A hardcoded-credential account
 * would be a publicly loginable hole on the live backend, so it must not exist
 * in production OR test.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { runMigrations } from "../../db/migrate.js";
import { query } from "../../db/client.js";

describe("no auto-seeded account", () => {
  before(runMigrations);

  test("migrations create zero users", async () => {
    const rows = await query<{ n: number }>("SELECT COUNT(*) AS n FROM users");
    assert.equal(rows[0].n, 0, "the backend must not seed any account");
  });
});
