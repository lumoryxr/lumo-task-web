/**
 * API · Recovery codes (#16) + email binding (#17)
 *   POST /v1/auth/register               — issues a one-time recovery code
 *   POST /v1/auth/recovery/reset         — offline password reset via the code
 *   POST /v1/auth/recovery-code/regenerate — replaces the active code
 *   POST /v1/auth/bind-email             — binds an (unverified) email
 */
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, uniqueUsername, uniqueEmail } from "../helpers/index.js";
import { drainOutbox } from "../../lib/email.js";

before(async () => {
  await setupDb();
});

beforeEach(() => {
  drainOutbox();
});

/** Register a username-only account; returns { username, token, recoveryCode }. */
async function register(prefix = "rec") {
  const username = uniqueUsername(prefix);
  const { status, body } = await req("POST", "/v1/auth/register", {
    body: { username, password: "password123" },
  });
  assert.equal(status, 201);
  return { username, token: body.token, recoveryCode: body.recoveryCode as string };
}

describe("POST /v1/auth/register → recovery code", () => {
  test("returns a well-formed one-time recovery code", async () => {
    const { recoveryCode } = await register("fmt");
    assert.match(recoveryCode, /^LUMO-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });
});

describe("POST /v1/auth/recovery/reset", () => {
  test("resets the password with a valid (username, code) and consumes the code", async () => {
    const { username, recoveryCode } = await register("reset");
    const newPassword = "Recovered123";

    const reset = await req("POST", "/v1/auth/recovery/reset", {
      body: { username, code: recoveryCode, new_password: newPassword },
    });
    assert.equal(reset.status, 200);
    assert.deepEqual(reset.body, { ok: true });

    // The new password works.
    const ok = await req("POST", "/v1/auth/signin", {
      body: { username, password: newPassword },
    });
    assert.equal(ok.status, 200);

    // The old password no longer works.
    const old = await req("POST", "/v1/auth/signin", {
      body: { username, password: "password123" },
    });
    assert.equal(old.status, 401);
  });

  test("the code is single-use — a second reset with it is rejected", async () => {
    const { username, recoveryCode } = await register("single");
    const first = await req("POST", "/v1/auth/recovery/reset", {
      body: { username, code: recoveryCode, new_password: "FirstReset1" },
    });
    assert.equal(first.status, 200);

    const second = await req("POST", "/v1/auth/recovery/reset", {
      body: { username, code: recoveryCode, new_password: "SecondReset1" },
    });
    assert.equal(second.status, 400);
    assert.equal(second.body.error.code, "INVALID_RECOVERY_CODE");
  });

  test("tolerates lost dashes / lowercase (canonicalized before compare)", async () => {
    const { username, recoveryCode } = await register("canon");
    const messy = recoveryCode.replace(/-/g, "").toLowerCase();
    const reset = await req("POST", "/v1/auth/recovery/reset", {
      body: { username, code: messy, new_password: "Canonical123" },
    });
    assert.equal(reset.status, 200);
  });

  test("400 INVALID_RECOVERY_CODE for a wrong code", async () => {
    const { username } = await register("wrong");
    const res = await req("POST", "/v1/auth/recovery/reset", {
      body: { username, code: "LUMO-0000-0000-0000-0000", new_password: "WhateverX1" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "INVALID_RECOVERY_CODE");
  });

  test("400 INVALID_RECOVERY_CODE for an unknown username (non-enumerable)", async () => {
    const res = await req("POST", "/v1/auth/recovery/reset", {
      body: { username: "nobodyhere", code: "LUMO-0000-0000-0000-0000", new_password: "WhateverX1" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "INVALID_RECOVERY_CODE");
  });

  test("400 VALIDATION_ERROR on a weak new password", async () => {
    const { username, recoveryCode } = await register("weak");
    const res = await req("POST", "/v1/auth/recovery/reset", {
      body: { username, code: recoveryCode, new_password: "short" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });
});

describe("POST /v1/auth/recovery-code/regenerate", () => {
  test("regenerating invalidates the previous code and returns a new one", async () => {
    const { username, token, recoveryCode: old } = await register("regen");

    const regen = await req("POST", "/v1/auth/recovery-code/regenerate", { token });
    assert.equal(regen.status, 200);
    assert.match(regen.body.recoveryCode, /^LUMO-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    assert.notEqual(regen.body.recoveryCode, old);

    // The OLD code no longer works.
    const withOld = await req("POST", "/v1/auth/recovery/reset", {
      body: { username, code: old, new_password: "Nope12345" },
    });
    assert.equal(withOld.status, 400);

    // The NEW code works.
    const withNew = await req("POST", "/v1/auth/recovery/reset", {
      body: { username, code: regen.body.recoveryCode, new_password: "FreshOne123" },
    });
    assert.equal(withNew.status, 200);
  });

  test("401 without a token", async () => {
    const { status } = await req("POST", "/v1/auth/recovery-code/regenerate");
    assert.equal(status, 401);
  });
});

describe("POST /v1/auth/bind-email", () => {
  test("binds an unverified email and sends a verification link", async () => {
    const { token } = await register("bind");
    const email = uniqueEmail("bind");
    const res = await req("POST", "/v1/auth/bind-email", { token, body: { email } });
    assert.equal(res.status, 200);
    assert.equal(res.body.email, email);
    assert.equal(res.body.emailVerified, false);

    const mails = drainOutbox();
    assert.equal(mails.length, 1, "binding should send a verification email");
    assert.equal(mails[0].to, email);

    // GET /v1/user now reflects the bound (still unverified) email.
    const me = await req("GET", "/v1/user", { token });
    assert.equal(me.body.email, email);
    assert.equal(me.body.emailVerified, false);
  });

  test("409 EMAIL_TAKEN when another account already owns the email", async () => {
    const email = uniqueEmail("shared");
    const a = await register("owner");
    await req("POST", "/v1/auth/bind-email", { token: a.token, body: { email } });

    const b = await register("clash");
    const res = await req("POST", "/v1/auth/bind-email", { token: b.token, body: { email } });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, "EMAIL_TAKEN");
  });

  test("401 without a token", async () => {
    const { status } = await req("POST", "/v1/auth/bind-email", { body: { email: uniqueEmail("x") } });
    assert.equal(status, 401);
  });

  test("400 on a malformed email", async () => {
    const { token } = await register("badmail");
    const res = await req("POST", "/v1/auth/bind-email", { token, body: { email: "not-an-email" } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });

  test("recovery still works for a username-only account with no email bound", async () => {
    const { username, recoveryCode } = await register("noemail");
    const res = await req("POST", "/v1/auth/recovery/reset", {
      body: { username, code: recoveryCode, new_password: "OfflineReset1" },
    });
    assert.equal(res.status, 200);
  });
});
