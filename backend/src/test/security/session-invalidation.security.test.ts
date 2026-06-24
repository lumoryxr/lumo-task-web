/**
 * Security · Password change invalidates existing sessions
 *
 * Tokens embed the session version they were minted with. Changing the password
 * bumps the user's session version, so every previously-issued token is rejected
 * — a stolen/old token can't outlive a password change.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";

before(setupDb);

describe("password change → session invalidation", () => {
  test("old token rejected after change; new login works", async () => {
    const u = await newUserWithToken("sessinv"); // registered with "password123"

    // Token works before the change.
    assert.equal((await req("GET", "/v1/user", { token: u.token })).status, 200);

    const change = await req("POST", "/v1/auth/change-password", {
      token: u.token,
      body: { current_password: "password123", new_password: "NewStrong123" },
    });
    assert.equal(change.status, 200);

    // The old token is now rejected (its session version is stale).
    assert.equal((await req("GET", "/v1/user", { token: u.token })).status, 401);

    // Signing in with the new password issues a working token.
    const signin = await req("POST", "/v1/auth/signin", {
      body: { email: u.email, password: "NewStrong123" },
    });
    assert.equal(signin.status, 200);
    assert.equal((await req("GET", "/v1/user", { token: signin.body.token })).status, 200);
  });
});
