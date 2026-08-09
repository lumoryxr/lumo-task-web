/**
 * API · Auth
 *   POST /v1/auth/register · /signin · /change-password · /signout
 *
 * Each route is tested for happy-path, validation (400), and auth (401).
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, ensureDemoUser, DEMO_USERNAME, DEMO_PASSWORD, uniqueUsername } from "../helpers/index.js";

before(async () => {
  await setupDb();
  await ensureDemoUser(); // register the primary fixture user via the public API
});

describe("POST /v1/auth/register", () => {
  test("201 → token + user + one-time recovery code on valid input", async () => {
    const { status, body } = await req("POST", "/v1/auth/register", {
      body: { username: "newuser", password: "password123" },
    });
    assert.equal(status, 201);
    assert.ok(body.token, "token missing");
    assert.equal(body.user.username, "newuser");
    assert.equal(body.user.email, null, "a fresh account has no email bound");
    assert.equal(body.user.plan, "free");
    assert.ok(body.user.initials, "initials missing");
    // The recovery code is surfaced exactly once, in the register response.
    assert.match(body.recoveryCode, /^LUMO-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });

  test("409 → duplicate username (case-insensitive) — error body has { code, message }", async () => {
    const { status, body } = await req("POST", "/v1/auth/register", {
      body: { username: "NewUser", password: "password123" },
    });
    assert.equal(status, 409);
    assert.equal(body.error.code, "USERNAME_TAKEN");
    assert.ok(body.error.message, "error.message missing");
  });

  test("400 → invalid username (illegal char)", async () => {
    const { status, body } = await req("POST", "/v1/auth/register", {
      body: { username: "bad name!", password: "password123" },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  test("400 → username starting with a separator", async () => {
    const { status } = await req("POST", "/v1/auth/register", {
      body: { username: "_leading", password: "password123" },
    });
    assert.equal(status, 400);
  });

  test("400 → reserved username", async () => {
    const { status } = await req("POST", "/v1/auth/register", {
      body: { username: "admin", password: "password123" },
    });
    assert.equal(status, 400);
  });

  test("400 → username too short", async () => {
    const { status } = await req("POST", "/v1/auth/register", {
      body: { username: "ab", password: "password123" },
    });
    assert.equal(status, 400);
  });

  test("400 → password shorter than 8 characters", async () => {
    const { status } = await req("POST", "/v1/auth/register", {
      body: { username: uniqueUsername("short"), password: "abc" },
    });
    assert.equal(status, 400);
  });

  test("400 → missing required fields", async () => {
    const { status } = await req("POST", "/v1/auth/register", {
      body: { username: uniqueUsername("missing") },
    });
    assert.equal(status, 400);
  });
});

describe("POST /v1/auth/signin", () => {
  test("200 → token + stats for demo credentials", async () => {
    const { status, body } = await req("POST", "/v1/auth/signin", {
      body: { username: DEMO_USERNAME, password: DEMO_PASSWORD },
    });
    assert.equal(status, 200);
    assert.ok(body.token, "token missing");
    assert.equal(body.user.username, DEMO_USERNAME);
    assert.ok("stats" in body.user, "stats missing");
  });

  test("200 → username lookup is case-insensitive", async () => {
    const { status } = await req("POST", "/v1/auth/signin", {
      body: { username: DEMO_USERNAME.toUpperCase(), password: DEMO_PASSWORD },
    });
    assert.equal(status, 200);
  });

  test("401 → wrong password — error body has { code, message }", async () => {
    const { status, body } = await req("POST", "/v1/auth/signin", {
      body: { username: DEMO_USERNAME, password: "wrongpassword" },
    });
    assert.equal(status, 401);
    assert.equal(typeof body.error, "object");
    assert.ok(body.error.code);
    assert.ok(body.error.message);
  });

  test("401 → unknown username", async () => {
    const { status } = await req("POST", "/v1/auth/signin", {
      body: { username: "ghostuser", password: "password123" },
    });
    assert.equal(status, 401);
  });

  test("400 → missing password field", async () => {
    const { status } = await req("POST", "/v1/auth/signin", {
      body: { username: DEMO_USERNAME },
    });
    assert.equal(status, 400);
  });
});

describe("POST /v1/auth/change-password", () => {
  // Dedicated account so demo credentials stay intact for other suites.
  let cpToken = "";
  const cpUser = uniqueUsername("cptest");

  before(async () => {
    await req("POST", "/v1/auth/register", {
      body: { username: cpUser, password: "oldpass123" },
    });
    const { body } = await req("POST", "/v1/auth/signin", {
      body: { username: cpUser, password: "oldpass123" },
    });
    cpToken = body.token;
  });

  test("200 → password changed, new credentials work", async () => {
    const { status } = await req("POST", "/v1/auth/change-password", {
      token: cpToken,
      body: { current_password: "oldpass123", new_password: "newpass456" },
    });
    assert.equal(status, 200);

    const { status: s401 } = await req("POST", "/v1/auth/signin", {
      body: { username: cpUser, password: "oldpass123" },
    });
    assert.equal(s401, 401, "old password should be rejected");

    const { status: s200 } = await req("POST", "/v1/auth/signin", {
      body: { username: cpUser, password: "newpass456" },
    });
    assert.equal(s200, 200, "new password should work");
  });

  test("400 → wrong current password", async () => {
    const { body } = await req("POST", "/v1/auth/signin", {
      body: { username: cpUser, password: "newpass456" },
    });
    const { status } = await req("POST", "/v1/auth/change-password", {
      token: body.token,
      body: { current_password: "not-the-current", new_password: "whatever123" },
    });
    assert.equal(status, 400);
  });

  test("400 → new password shorter than 8 chars", async () => {
    const { body: signinBody } = await req("POST", "/v1/auth/signin", {
      body: { username: cpUser, password: "newpass456" },
    });
    const { status } = await req("POST", "/v1/auth/change-password", {
      token: signinBody.token,
      body: { current_password: "newpass456", new_password: "short" },
    });
    assert.equal(status, 400);
  });

  test("401 → no token", async () => {
    const { status } = await req("POST", "/v1/auth/change-password", {
      body: { current_password: "x", new_password: "y12345678" },
    });
    assert.equal(status, 401);
  });
});

describe("POST /v1/auth/signout", () => {
  test("200 → { ok: true } with valid token", async () => {
    // Fresh throwaway token so we never revoke a token another suite relies on.
    const { body: signinBody } = await req("POST", "/v1/auth/signin", {
      body: { username: DEMO_USERNAME, password: DEMO_PASSWORD },
    });
    const throwawayToken = signinBody.token;
    const { status, body } = await req("POST", "/v1/auth/signout", { token: throwawayToken });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });

  test("401 → signout without token is rejected", async () => {
    const { status } = await req("POST", "/v1/auth/signout");
    assert.equal(status, 401);
  });
});
