/**
 * API · Email verification
 *   registration sends a verification email; account starts unverified
 *   POST /v1/auth/verify-email       — single-use token flips the flag
 *   POST /v1/auth/resend-verification — auth-gated, no-op once verified
 */
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, uniqueEmail, uniqueUsername } from "../helpers/index.js";
import { drainOutbox } from "../../lib/email.js";
import { app } from "../../app.js";

// GET the emailed link directly against the app (the shared `req` helper can't
// parse an empty 302 body). A forwarded host makes appBaseUrl resolve to an SPA
// origin so the handler redirects (its no-host fallback serves inline HTML).
async function openVerifyLink(token: string | null) {
  const qs = token === null ? "" : `?token=${encodeURIComponent(token)}`;
  return app.request(`/v1/auth/verify-email${qs}`, {
    method: "GET",
    headers: { "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" },
  });
}

before(async () => {
  await setupDb();
});

beforeEach(() => {
  drainOutbox();
});

/**
 * Register a fresh username-only user, then bind an email (which triggers the
 * verification flow). Returns the register body + the emailed verify token.
 */
async function registerAndGetToken(prefix = "verify") {
  const username = uniqueUsername(prefix);
  const email = uniqueEmail(prefix);
  const { status, body } = await req("POST", "/v1/auth/register", {
    body: { username, password: "password123" },
  });
  assert.equal(status, 201);
  drainOutbox(); // registration itself sends no email
  const bind = await req("POST", "/v1/auth/bind-email", { token: body.token, body: { email } });
  assert.equal(bind.status, 200);
  const mails = drainOutbox();
  assert.equal(mails.length, 1, "binding an email should send exactly one verification email");
  assert.equal(mails[0].to, email);
  const m = mails[0].text.match(/verify-email\?token=([^\s]+)/);
  assert.ok(m, "verification link with token not found");
  return { email, token: body.token, userId: body.user.id, verifyToken: decodeURIComponent(m![1]), body };
}

describe("registration → verification email", () => {
  test("new account is unverified and gets a verification email once an email is bound", async () => {
    const r = await registerAndGetToken("newacct");
    assert.equal(r.body.user.emailVerified, false);

    const me = await req("GET", "/v1/user", { token: r.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.emailVerified, false);
  });
});

describe("GET /v1/auth/verify-email (the emailed link)", () => {
  test("the emailed link points at the API's own GET endpoint", async () => {
    const username = uniqueUsername("linkhost");
    const email = uniqueEmail("linkhost");
    const reg = await req("POST", "/v1/auth/register", { body: { username, password: "password123" } });
    drainOutbox();
    await req("POST", "/v1/auth/bind-email", { token: reg.body.token, body: { email } });
    const mails = drainOutbox();
    assert.match(mails[0].text, /\/v1\/auth\/verify-email\?token=/, "link must target the API GET endpoint");
  });

  test("valid token verifies server-side and redirects to the SPA success page", async () => {
    const r = await registerAndGetToken("getok");

    const res = await openVerifyLink(r.verifyToken);
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location") ?? "", /\/verify-email\?status=success$/);

    // The account is verified purely from the GET click — no SPA POST involved.
    const me = await req("GET", "/v1/user", { token: r.token });
    assert.equal(me.body.emailVerified, true);

    // Single-use: opening the (now consumed) link again lands on the invalid page.
    const again = await openVerifyLink(r.verifyToken);
    assert.equal(again.status, 302);
    assert.match(again.headers.get("location") ?? "", /\/verify-email\?status=invalid$/);
  });

  test("unknown token redirects to the invalid page and verifies nothing", async () => {
    const r = await registerAndGetToken("getbad");

    const res = await openVerifyLink("nope");
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location") ?? "", /\/verify-email\?status=invalid$/);

    const me = await req("GET", "/v1/user", { token: r.token });
    assert.equal(me.body.emailVerified, false);
  });

  test("missing token redirects to the invalid page", async () => {
    const res = await openVerifyLink(null);
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location") ?? "", /\/verify-email\?status=invalid$/);
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
