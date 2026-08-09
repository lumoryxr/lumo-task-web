/**
 * API · User
 *   GET    /v1/user          — profile + stats
 *   GET    /v1/user/export   — GDPR/CCPA data export (isolation + no secret leak)
 *   DELETE /v1/user          — account erasure (isolation + token invalidation)
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import {
  req,
  setupDb,
  signInDemo,
  DEMO_EMAIL,
  newUserWithToken,
  seedTask,
  seedHabit,
  seedCountdown,
  expectConforms,
  assertNoSecrets,
} from "../helpers/index.js";
import { DataExportWireSchema } from "@lumo/contracts";

let demoToken = "";
let demoUserId = "";

before(async () => {
  await setupDb();
  ({ token: demoToken, userId: demoUserId } = await signInDemo());
});

describe("GET /v1/user", () => {
  test("200 → full user profile with stats", async () => {
    const { status, body } = await req("GET", "/v1/user", { token: demoToken });
    assert.equal(status, 200);
    assert.equal(body.id, demoUserId);
    assert.equal(body.email, DEMO_EMAIL);
    assert.ok("stats" in body, "stats missing");
    assert.ok(typeof body.stats.tasks === "number");
    assert.ok(typeof body.stats.pomodoros === "number");
  });

  test("401 → no token", async () => {
    const { status } = await req("GET", "/v1/user");
    assert.equal(status, 401);
  });
});

describe("GET /v1/user/export", () => {
  test("401 → no token", async () => {
    const { status } = await req("GET", "/v1/user/export");
    assert.equal(status, 401);
  });

  test("200 → conforms to the contract and contains the caller's data", async () => {
    const u = await newUserWithToken("exporter");
    await seedTask(u.token, { title: { en: "Export me" } });
    await seedHabit(u.token, { title: "Meditate" });
    await seedCountdown(u.token, { title: "Launch" });

    const { status, body } = await req("GET", "/v1/user/export", { token: u.token });
    assert.equal(status, 200);
    const bundle = expectConforms(DataExportWireSchema, body, "export");
    assert.equal(bundle.user.email, u.email);
    assert.equal(bundle.format_version, 1);
    assert.equal(bundle.tasks.length, 1);
    assert.equal(bundle.habits.length, 1);
    assert.equal(bundle.countdowns.length, 1);
    assert.equal((bundle.tasks[0] as any).title_en, "Export me");
  });

  test("never leaks a stored AI key or any credential-bearing field", async () => {
    const u = await newUserWithToken("secret-holder");
    const rawKey = "sk-super-secret-key-do-not-leak-123456";
    const patch = await req("PATCH", "/v1/settings", {
      token: u.token,
      body: { ai_configs_update: { provider: "openai", key: rawKey } },
    });
    assert.equal(patch.status, 200);

    const { status, body } = await req("GET", "/v1/user/export", { token: u.token });
    assert.equal(status, 200);
    // The plaintext key (and its encrypted form) must appear nowhere in the bundle.
    assertNoSecrets(body, [rawKey]);
    // The scrubbed settings row surfaces presence as a flag, never the key/config blob.
    assert.ok(body.settings, "settings should be present after a PATCH");
    assert.equal("ai_api_key" in body.settings, false, "ai_api_key must not be exported");
    assert.equal("ai_configs" in body.settings, false, "ai_configs must not be exported");
    assert.equal("remote_token" in body.settings, false, "remote_token must not be exported");
    assert.equal(body.settings.has_ai_key, 1);
  });

  test("is tenant-isolated — one user's export never contains another's rows", async () => {
    const a = await newUserWithToken("iso-a");
    const b = await newUserWithToken("iso-b");
    await seedTask(a.token, { title: { en: "A private task" } });

    const { body } = await req("GET", "/v1/user/export", { token: b.token });
    assert.equal(body.tasks.length, 0, "B's export must not include A's tasks");
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes("A private task"), "cross-tenant data leaked into export");
  });
});

describe("DELETE /v1/user", () => {
  test("401 → no token", async () => {
    const { status } = await req("DELETE", "/v1/user");
    assert.equal(status, 401);
  });

  test("200 → erases the account; the token is then rejected and the data is gone", async () => {
    const u = await newUserWithToken("doomed");
    await seedTask(u.token, { title: { en: "Ephemeral" } });

    const del = await req("DELETE", "/v1/user", { token: u.token });
    assert.equal(del.status, 200);
    assert.deepEqual(del.body, { ok: true });

    // The access token is dead now that the user row is gone.
    const after = await req("GET", "/v1/user", { token: u.token });
    assert.equal(after.status, 401);

    // Sign-in with the same credentials no longer resolves an account.
    const signin = await req("POST", "/v1/auth/signin", {
      body: { username: u.username, password: "password123" },
    });
    assert.equal(signin.status, 401);
  });

  test("is tenant-isolated — deleting one account leaves another's data intact", async () => {
    const a = await newUserWithToken("del-a");
    const b = await newUserWithToken("del-b");
    await seedTask(b.token, { title: { en: "B survives" } });

    const del = await req("DELETE", "/v1/user", { token: a.token });
    assert.equal(del.status, 200);

    // B's account and data are untouched.
    const bProfile = await req("GET", "/v1/user", { token: b.token });
    assert.equal(bProfile.status, 200);
    const bExport = await req("GET", "/v1/user/export", { token: b.token });
    assert.equal(bExport.body.tasks.length, 1);
    assert.equal((bExport.body.tasks[0] as any).title_en, "B survives");
  });
});
