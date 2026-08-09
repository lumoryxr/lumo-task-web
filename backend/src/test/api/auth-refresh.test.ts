/**
 * API · Auth refresh tokens
 *   POST /v1/auth/refresh · rotation · reuse detection · revocation
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, uniqueUsername } from "../helpers/index.js";

const PW = "password123";

async function registerFresh(): Promise<{ token: string; refreshToken: string; username: string }> {
  const username = uniqueUsername("refresh");
  const { status, body } = await req("POST", "/v1/auth/register", {
    body: { username, password: PW },
  });
  assert.equal(status, 201, "register should succeed");
  return { token: body.token, refreshToken: body.refreshToken, username };
}

before(async () => {
  await setupDb();
});

describe("POST /v1/auth/refresh", () => {
  test("register and signin both return a refresh token", async () => {
    const { refreshToken, username } = await registerFresh();
    assert.equal(typeof refreshToken, "string");
    assert.ok(refreshToken.length > 0);

    const { body: signin } = await req("POST", "/v1/auth/signin", { body: { username, password: PW } });
    assert.equal(typeof signin.refreshToken, "string");
    assert.ok(signin.refreshToken.length > 0);
  });

  test("valid refresh token → new access token + rotated refresh token, and the access token works", async () => {
    const { refreshToken } = await registerFresh();
    const { status, body } = await req("POST", "/v1/auth/refresh", { body: { refreshToken } });
    assert.equal(status, 200);
    assert.ok(body.token, "new access token missing");
    assert.ok(body.refreshToken, "rotated refresh token missing");
    assert.notEqual(body.refreshToken, refreshToken, "refresh token must rotate");

    // The freshly minted access token must authenticate a protected route.
    const protectedRes = await req("GET", "/v1/tasks", { token: body.token });
    assert.equal(protectedRes.status, 200, "refreshed access token should be accepted");
  });

  test("a rotated (old) refresh token is rejected, and reuse revokes the whole family", async () => {
    const { refreshToken: rt1 } = await registerFresh();
    const { body: r1 } = await req("POST", "/v1/auth/refresh", { body: { refreshToken: rt1 } });
    const rt2 = r1.refreshToken;

    // Replaying the already-rotated rt1 is a reuse → 401.
    const reuse = await req("POST", "/v1/auth/refresh", { body: { refreshToken: rt1 } });
    assert.equal(reuse.status, 401, "rotated token must not be reusable");

    // Reuse detection revokes the family, so the otherwise-valid rt2 is dead too.
    const rt2res = await req("POST", "/v1/auth/refresh", { body: { refreshToken: rt2 } });
    assert.equal(rt2res.status, 401, "reuse must revoke the whole token family");
  });

  test("garbage refresh token → 401 INVALID_REFRESH_TOKEN", async () => {
    const { status, body } = await req("POST", "/v1/auth/refresh", { body: { refreshToken: "not-a-real-token" } });
    assert.equal(status, 401);
    assert.equal(body.error?.code, "INVALID_REFRESH_TOKEN");
  });

  test("missing refreshToken → 400 validation error", async () => {
    const { status } = await req("POST", "/v1/auth/refresh", { body: {} });
    assert.equal(status, 400);
  });

  test("signing out with the refresh token in the body revokes it", async () => {
    const { token, refreshToken } = await registerFresh();
    const out = await req("POST", "/v1/auth/signout", { token, body: { refreshToken } });
    assert.equal(out.status, 200);

    const after = await req("POST", "/v1/auth/refresh", { body: { refreshToken } });
    assert.equal(after.status, 401, "revoked refresh token must not refresh");
  });

  test("changing the password invalidates outstanding refresh tokens", async () => {
    const { token, refreshToken } = await registerFresh();
    const chg = await req("POST", "/v1/auth/change-password", {
      token,
      body: { current_password: PW, new_password: "newpassword456" },
    });
    assert.equal(chg.status, 200);

    const after = await req("POST", "/v1/auth/refresh", { body: { refreshToken } });
    assert.equal(after.status, 401, "password change must invalidate refresh tokens (session_version bump)");
  });
});
