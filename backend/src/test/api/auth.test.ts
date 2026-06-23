/**
 * API · Auth
 *   POST /v1/auth/register · /signin · /change-password · /signout
 *
 * Each route is tested for happy-path, validation (400), and auth (401).
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, ensureDemoUser, DEMO_EMAIL, DEMO_PASSWORD } from "../helpers/index.js";

before(async () => {
  await setupDb();
  await ensureDemoUser(); // register the primary fixture user via the public API
});

describe("POST /v1/auth/register", () => {
  test("201 → token + user object on valid input", async () => {
    const { status, body } = await req("POST", "/v1/auth/register", {
      body: { email: "newuser@example.com", password: "password123", name: "New User" },
    });
    assert.equal(status, 201);
    assert.ok(body.token, "token missing");
    assert.equal(body.user.email, "newuser@example.com");
    assert.equal(body.user.plan, "free");
    assert.ok(body.user.initials, "initials missing");
  });

  test("409 → duplicate email — error body has { code, message }", async () => {
    const { status, body } = await req("POST", "/v1/auth/register", {
      body: { email: "newuser@example.com", password: "password123", name: "New User" },
    });
    assert.equal(status, 409);
    assert.equal(typeof body.error, "object", "error should be an object");
    assert.ok(body.error.code, "error.code missing");
    assert.ok(body.error.message, "error.message missing");
  });

  test("400 → invalid email format", async () => {
    const { status } = await req("POST", "/v1/auth/register", {
      body: { email: "not-an-email", password: "password123", name: "User" },
    });
    assert.equal(status, 400);
    // Note: Zod validator returns its own format; httpError format applies to
    // business-logic errors (409, 401) not to schema validation failures.
  });

  test("400 → password shorter than 8 characters", async () => {
    const { status } = await req("POST", "/v1/auth/register", {
      body: { email: "short@example.com", password: "abc", name: "User" },
    });
    assert.equal(status, 400);
  });

  test("400 → missing required fields", async () => {
    const { status } = await req("POST", "/v1/auth/register", {
      body: { email: "missing@example.com" },
    });
    assert.equal(status, 400);
  });
});

describe("POST /v1/auth/signin", () => {
  test("200 → token + stats for demo credentials", async () => {
    const { status, body } = await req("POST", "/v1/auth/signin", {
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
    });
    assert.equal(status, 200);
    assert.ok(body.token, "token missing");
    assert.equal(body.user.email, DEMO_EMAIL);
    assert.ok("stats" in body.user, "stats missing");
  });

  test("401 → wrong password — error body has { code, message }", async () => {
    const { status, body } = await req("POST", "/v1/auth/signin", {
      body: { email: DEMO_EMAIL, password: "wrongpassword" },
    });
    assert.equal(status, 401);
    assert.equal(typeof body.error, "object");
    assert.ok(body.error.code);
    assert.ok(body.error.message);
  });

  test("401 → unknown email", async () => {
    const { status } = await req("POST", "/v1/auth/signin", {
      body: { email: "ghost@example.com", password: "password123" },
    });
    assert.equal(status, 401);
  });

  test("400 → missing password field", async () => {
    const { status } = await req("POST", "/v1/auth/signin", {
      body: { email: DEMO_EMAIL },
    });
    assert.equal(status, 400);
  });
});

describe("POST /v1/auth/change-password", () => {
  // Dedicated account so demo credentials stay intact for other suites.
  let cpToken = "";

  before(async () => {
    await req("POST", "/v1/auth/register", {
      body: { email: "cptest@example.com", password: "oldpass123", name: "CP Test" },
    });
    const { body } = await req("POST", "/v1/auth/signin", {
      body: { email: "cptest@example.com", password: "oldpass123" },
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
      body: { email: "cptest@example.com", password: "oldpass123" },
    });
    assert.equal(s401, 401, "old password should be rejected");

    const { status: s200 } = await req("POST", "/v1/auth/signin", {
      body: { email: "cptest@example.com", password: "newpass456" },
    });
    assert.equal(s200, 200, "new password should work");
  });

  test("400 → wrong current password", async () => {
    const { body } = await req("POST", "/v1/auth/signin", {
      body: { email: "cptest@example.com", password: "newpass456" },
    });
    const { status } = await req("POST", "/v1/auth/change-password", {
      token: body.token,
      body: { current_password: "not-the-current", new_password: "whatever123" },
    });
    assert.equal(status, 400);
  });

  test("400 → new password shorter than 8 chars", async () => {
    const { body: signinBody } = await req("POST", "/v1/auth/signin", {
      body: { email: "cptest@example.com", password: "newpass456" },
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
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
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
