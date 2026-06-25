/**
 * Security · App-level sync is gated to single-tenant databases
 *
 * `lib/sync.ts` copies EVERY row (no user_id scoping) to the configured remote
 * and picks the remote config with `LIMIT 1`. That is correct only on a
 * single-user database (desktop / self-host). On a shared multi-tenant backend
 * it would push every tenant's tasks/completed entries to one user's remote DB
 * — a cross-tenant data leak. These tests lock in the guard that refuses to run
 * or configure app-level sync once the database holds more than one user.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";
import { execute, queryOne } from "../../db/client.js";
import { appLevelSyncAllowed } from "../../lib/sync.js";

async function resetUsers(): Promise<void> {
  await execute("DELETE FROM settings");
  await execute("DELETE FROM users");
}

describe("Security · app-level sync gated to single-tenant", () => {
  before(async () => {
    await setupDb();
  });

  test("appLevelSyncAllowed(): allowed with ≤1 user, refused with ≥2", async () => {
    await resetUsers();
    assert.equal(await appLevelSyncAllowed(), true, "0 users → allowed");
    await newUserWithToken("gate1");
    assert.equal(await appLevelSyncAllowed(), true, "1 user → allowed");
    await newUserWithToken("gate2");
    assert.equal(await appLevelSyncAllowed(), false, "2 users → refused (would leak across tenants)");
  });

  test("PATCH /storage/remote-config is rejected on a multi-tenant DB and stores nothing", async () => {
    await resetUsers();
    const a = await newUserWithToken("synca");
    await newUserWithToken("syncb"); // second user → multi-tenant

    const { status, body } = await req("PATCH", "/v1/storage/remote-config", {
      token: a.token,
      body: { remoteUrl: "https://tenant-leak.turso.io", remoteToken: "super-secret-token" },
    });

    assert.equal(status, 409, "configuring sync on a shared backend must be refused");
    assert.equal(body.error?.code, "SYNC_MULTITENANT_DISABLED");

    // The token must never be persisted on a shared deployment.
    const row = await queryOne<{ remote_url: string | null; remote_token: string | null }>(
      "SELECT remote_url, remote_token FROM settings WHERE user_id = :uid",
      { uid: a.userId },
    );
    assert.equal(row?.remote_url ?? null, null, "remote_url must not be persisted");
    assert.equal(row?.remote_token ?? null, null, "remote_token must not be persisted");
  });
});
