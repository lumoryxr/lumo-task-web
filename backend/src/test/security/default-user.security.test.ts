/**
 * Security · Demo user must never be seeded in production
 *
 * The fixed-credential demo account (alex@stride.studio / demo1234, plan=pro) is
 * a local dev + test fixture. On the production startup path it would be a
 * publicly loginable account on the live backend, so `seedDemoUserIfPermitted()`
 * — used by index.ts and the migrate script — must skip seeding when
 * NODE_ENV=production. (ensureDefaultUser() itself stays unguarded so test
 * fixtures can seed directly regardless of NODE_ENV.)
 */
import { test, describe, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runMigrations, seedDemoUserIfPermitted } from "../../db/migrate.js";
import { queryOne } from "../../db/client.js";

const ORIGINAL_ENV = process.env.NODE_ENV;

describe("seedDemoUserIfPermitted()", () => {
  before(async () => {
    await runMigrations(); // fresh schema, no demo user yet
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  test("production → skips seeding, no demo user created", async () => {
    process.env.NODE_ENV = "production";
    const seeded = await seedDemoUserIfPermitted();
    assert.equal(seeded, false, "must report it did not seed in production");
    const u = await queryOne("SELECT id FROM users WHERE id = 'u1'");
    assert.ok(!u, "demo user must NOT exist on the production startup path");
  });

  test("non-production → seeds the demo fixture user", async () => {
    process.env.NODE_ENV = "development";
    const seeded = await seedDemoUserIfPermitted();
    assert.equal(seeded, true, "must seed outside production");
    const u = await queryOne<{ id: string }>("SELECT id FROM users WHERE id = 'u1'");
    assert.equal(u?.id, "u1", "demo user should exist for dev/test fixtures");
  });
});
