/**
 * API · Password reset
 *   POST /v1/auth/forgot-password  — enumeration-safe request
 *   POST /v1/auth/reset-password   — single-use token, invalidates old sessions
 */
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";
import { drainOutbox } from "../../lib/email.js";

before(async () => {
  await setupDb();
});

beforeEach(() => {
  // Isolate each test from another's captured emails.
  drainOutbox();
});

/** Pull the raw reset token out of the most recent dev-outbox email. */
function tokenFromOutbox(): string {
  const mails = drainOutbox();
  assert.equal(mails.length, 1, `expected exactly one email, got ${mails.length}`);
  const m = mails[0].text.match(/reset-password\?token=([^\s]+)/);
  assert.ok(m, "reset link with token not found in email body");
  return decodeURIComponent(m![1]);
}

describe("POST /v1/auth/forgot-password", () => {
  test("200 and NO email for an unknown address (no enumeration)", async () => {
    const { status, body } = await req("POST", "/v1/auth/forgot-password", {
      body: { email: "definitely-not-registered@example.com" },
    });
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true });
    assert.equal(drainOutbox().length, 0, "must not send mail to an unknown address");
  });

  test("200 and an email with a reset link for a known address", async () => {
    const u = await newUserWithToken("forgot");
    const { status, body } = await req("POST", "/v1/auth/forgot-password", {
      body: { email: u.email },
    });
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true });
    const mails = drainOutbox();
    assert.equal(mails.length, 1);
    assert.equal(mails[0].to, u.email);
    assert.match(mails[0].text, /reset-password\?token=/);
  });

  test("400 on a malformed email", async () => {
    const { status, body } = await req("POST", "/v1/auth/forgot-password", { body: { email: "nope" } });
    assert.equal(status, 400);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });
});

describe("POST /v1/auth/reset-password", () => {
  test("400 INVALID_RESET_TOKEN for an unknown token", async () => {
    const { status, body } = await req("POST", "/v1/auth/reset-password", {
      body: { token: "not-a-real-token", new_password: "BrandNew123" },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, "INVALID_RESET_TOKEN");
  });

  test("400 on a weak new password (still validated)", async () => {
    const u = await newUserWithToken("weak");
    await req("POST", "/v1/auth/forgot-password", { body: { email: u.email } });
    const token = tokenFromOutbox();
    const { status, body } = await req("POST", "/v1/auth/reset-password", {
      body: { token, new_password: "short" },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  test("full flow: resets the password, kills old sessions, token is single-use", async () => {
    const u = await newUserWithToken("reset");
    const oldToken = u.token; // access token from registration
    const newPassword = "FreshPass123";

    await req("POST", "/v1/auth/forgot-password", { body: { email: u.email } });
    const token = tokenFromOutbox();

    const reset = await req("POST", "/v1/auth/reset-password", {
      body: { token, new_password: newPassword },
    });
    assert.equal(reset.status, 200);
    assert.deepEqual(reset.body, { ok: true });

    // New password works.
    const signinNew = await req("POST", "/v1/auth/signin", {
      body: { email: u.email, password: newPassword },
    });
    assert.equal(signinNew.status, 200);

    // Old password no longer works.
    const signinOld = await req("POST", "/v1/auth/signin", {
      body: { email: u.email, password: "password123" },
    });
    assert.equal(signinOld.status, 401);

    // The pre-reset access token is invalidated (session_version bumped).
    const oldSession = await req("GET", "/v1/user", { token: oldToken });
    assert.equal(oldSession.status, 401);

    // The token is single-use — a second reset with it is rejected.
    const reuse = await req("POST", "/v1/auth/reset-password", {
      body: { token, new_password: "AnotherOne123" },
    });
    assert.equal(reuse.status, 400);
    assert.equal(reuse.body.error.code, "INVALID_RESET_TOKEN");
  });
});
