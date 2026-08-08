/**
 * API · Email verification
 *   registration sends a verification email; account starts unverified
 *   POST /v1/auth/verify-email       — single-use token flips the flag
 *   POST /v1/auth/resend-verification — auth-gated, no-op once verified
 */
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, uniqueEmail } from "../helpers/index.js";
import { drainOutbox } from "../../lib/email.js";

before(async () => {
  await setupDb();
});

beforeEach(() => {
  drainOutbox();
});

/** Register a fresh user; returns the response body + the emailed verify token. */
async function registerAndGetToken(prefix = "verify") {
  const email = uniqueEmail(prefix);
  const { status, body } = await req("POST", "/v1/auth/register", {
    body: { email, password: "password123", name: prefix },
  });
  assert.equal(status, 201);
  const mails = drainOutbox();
  assert.equal(mails.length, 1, "registration should send exactly one verification email");
  assert.equal(mails[0].to, email);
  const m = mails[0].text.match(/verify-email\?token=([^\s]+)/);
  assert.ok(m, "verification link with token not found");
  return { email, token: body.token, userId: body.user.id, verifyToken: decodeURIComponent(m![1]), body };
}

describe("registration → verification email", () => {
  test("new account is unverified and gets a verification email", async () => {
    const r = await registerAndGetToken("newacct");
    assert.equal(r.body.user.emailVerified, false);

    const me = await req("GET", "/v1/user", { token: r.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.emailVerified, false);
  });
});

describe("POST /v1/auth/verify-email", () => {
  test("400 INVALID_VERIFICATION_TOKEN for an unknown token", async () => {
    const { status, body } = await req("POST", "/v1/auth/verify-email", { body: { token: "nope" } });
    assert.equal(status, 400);
    assert.equal(body.error.code, "INVALID_VERIFICATION_TOKEN");
  });

  test("valid token verifies the account; the token is single-use", async () => {
    const r = await registerAndGetToken("verifyok");

    const v = await req("POST", "/v1/auth/verify-email", { body: { token: r.verifyToken } });
    assert.equal(v.status, 200);
    assert.deepEqual(v.body, { ok: true });

    const me = await req("GET", "/v1/user", { token: r.token });
    assert.equal(me.body.emailVerified, true);

    // Reusing the consumed token is rejected.
    const again = await req("POST", "/v1/auth/verify-email", { body: { token: r.verifyToken } });
    assert.equal(again.status, 400);
    assert.equal(again.body.error.code, "INVALID_VERIFICATION_TOKEN");
  });
});

describe("POST /v1/auth/resend-verification", () => {
  test("401 without a token", async () => {
    const { status } = await req("POST", "/v1/auth/resend-verification");
    assert.equal(status, 401);
  });

  test("re-sends while unverified, then becomes a no-op once verified", async () => {
    const r = await registerAndGetToken("resend");

    // Unverified → a fresh verification email is sent.
    const resend1 = await req("POST", "/v1/auth/resend-verification", { token: r.token });
    assert.equal(resend1.status, 200);
    const mails = drainOutbox();
    assert.equal(mails.length, 1, "resend should send an email while unverified");
    const m = mails[0].text.match(/verify-email\?token=([^\s]+)/);
    assert.ok(m);

    // Verify with the resent token.
    const v = await req("POST", "/v1/auth/verify-email", { body: { token: decodeURIComponent(m![1]) } });
    assert.equal(v.status, 200);

    // Verified → resend is a silent no-op (still 200, no email).
    const resend2 = await req("POST", "/v1/auth/resend-verification", { token: r.token });
    assert.equal(resend2.status, 200);
    assert.equal(drainOutbox().length, 0, "resend must not email an already-verified account");
  });
});
