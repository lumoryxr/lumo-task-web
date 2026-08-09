/**
 * API · GitHub OAuth login (#15)
 *   GET  /v1/auth/github/config    — env-gated capability flag
 *   GET  /v1/auth/github/start     — 501 unconfigured · 302 authorize when set
 *   GET  /v1/auth/github/callback  — state validation · new-vs-existing account
 *   POST /v1/auth/github/exchange  — one-time session handoff (single-use)
 *   POST /v1/auth/github/link      — bind identity · 409 when already linked
 *
 * The GitHub HTTP layer is mocked via the `githubOauth` seam — no real network
 * call is ever made. Env credentials are toggled per test to exercise both the
 * configured and unconfigured paths.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";
import { githubOauth } from "../../lib/githubOauth.js";

const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret";

function enableGithub() {
  process.env.LUMO_GITHUB_CLIENT_ID = CLIENT_ID;
  process.env.LUMO_GITHUB_CLIENT_SECRET = CLIENT_SECRET;
}
function disableGithub() {
  delete process.env.LUMO_GITHUB_CLIENT_ID;
  delete process.env.LUMO_GITHUB_CLIENT_SECRET;
}

/** Extract a query param from a redirect Location (handles the `#` SPA fragment). */
function paramFromLocation(location: string | null, key: string): string | null {
  if (!location) return null;
  const m = location.match(new RegExp(`[?&]${key}=([^&]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Drive /start and return the minted single-use state. */
async function mintState(): Promise<string> {
  const res = await req("GET", "/v1/auth/github/start");
  assert.equal(res.status, 302, "start should redirect when configured");
  const state = paramFromLocation(res.headers.get("location"), "state");
  assert.ok(state, "authorize URL must carry a state");
  return state!;
}

const realExchange = githubOauth.exchangeCode;
const realFetchUser = githubOauth.fetchGithubUser;

before(async () => {
  await setupDb();
});

after(() => {
  // Restore the real GitHub client + clear env so nothing leaks past this file.
  githubOauth.exchangeCode = realExchange;
  githubOauth.fetchGithubUser = realFetchUser;
  disableGithub();
});

describe("GET /v1/auth/github/config", () => {
  test("githubEnabled=false when the server has no credentials", async () => {
    disableGithub();
    const { status, body } = await req("GET", "/v1/auth/github/config");
    assert.equal(status, 200);
    assert.equal(body.githubEnabled, false);
  });

  test("githubEnabled=true once both env credentials are set", async () => {
    enableGithub();
    const { status, body } = await req("GET", "/v1/auth/github/config");
    assert.equal(status, 200);
    assert.equal(body.githubEnabled, true);
  });
});

describe("GET /v1/auth/github/start", () => {
  test("501 OAUTH_NOT_CONFIGURED when unconfigured", async () => {
    disableGithub();
    const { status, body } = await req("GET", "/v1/auth/github/start");
    assert.equal(status, 501);
    assert.equal(body.error.code, "OAUTH_NOT_CONFIGURED");
  });

  test("302 to the GitHub authorize URL (scope read:user + state) when configured", async () => {
    enableGithub();
    const { status, headers } = await req("GET", "/v1/auth/github/start");
    assert.equal(status, 302);
    const loc = headers.get("location") ?? "";
    assert.ok(loc.startsWith("https://github.com/login/oauth/authorize"), `unexpected authorize URL: ${loc}`);
    assert.match(loc, /scope=read%3Auser/);
    assert.ok(paramFromLocation(loc, "state"), "state param missing");
    assert.match(loc, new RegExp(`client_id=${CLIENT_ID}`));
  });
});

describe("GET /v1/auth/github/callback", () => {
  beforeEach(() => {
    enableGithub();
    githubOauth.exchangeCode = async () => "fake-access-token";
  });

  test("redirects to /login?error=oauth when state is unknown/expired (never a raw JSON page)", async () => {
    // The callback is a browser navigation, so an invalid state must land the
    // user on the login screen, not a bare JSON error body.
    const res = await req("GET", "/v1/auth/github/callback?code=abc&state=bogus-state");
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location") ?? "", /#\/login\?error=oauth/);
  });

  test("new GitHub identity creates an account; the same identity logs back into it", async () => {
    githubOauth.fetchGithubUser = async () => ({ id: "900100", login: "octoNew" });

    // First sign-in → creates the account and hands off a session code.
    const cb1 = await req("GET", `/v1/auth/github/callback?code=abc&state=${await mintState()}`);
    assert.equal(cb1.status, 302);
    const handoff1 = paramFromLocation(cb1.headers.get("location"), "code");
    assert.ok(handoff1, "callback must hand off a one-time code");
    assert.match(cb1.headers.get("location") ?? "", /#\/oauth\/github\?code=/);

    const ex1 = await req("POST", "/v1/auth/github/exchange", { body: { code: handoff1 } });
    assert.equal(ex1.status, 200);
    assert.ok(ex1.body.token, "exchange must return a token");
    assert.ok(ex1.body.refreshToken, "exchange must return a refresh token");
    const firstUserId = ex1.body.user.id;
    assert.ok(ex1.body.user.username, "derived username missing");
    assert.equal(ex1.body.user.email, null, "GitHub email is not auto-trusted");
    assert.equal(ex1.body.user.emailVerified, false);

    // Second sign-in with the SAME GitHub id → logs into the SAME account.
    const cb2 = await req("GET", `/v1/auth/github/callback?code=abc&state=${await mintState()}`);
    const handoff2 = paramFromLocation(cb2.headers.get("location"), "code");
    const ex2 = await req("POST", "/v1/auth/github/exchange", { body: { code: handoff2 } });
    assert.equal(ex2.status, 200);
    assert.equal(ex2.body.user.id, firstUserId, "same GitHub identity must map to one account");
  });

  test("redirects to /login?error=oauth when the token exchange fails upstream", async () => {
    githubOauth.exchangeCode = async () => {
      throw new Error("boom");
    };
    githubOauth.fetchGithubUser = async () => ({ id: "900199", login: "shouldNotRun" });
    const cb = await req("GET", `/v1/auth/github/callback?code=abc&state=${await mintState()}`);
    assert.equal(cb.status, 302);
    assert.match(cb.headers.get("location") ?? "", /#\/login\?error=oauth/);
  });
});

describe("POST /v1/auth/github/exchange", () => {
  beforeEach(() => {
    enableGithub();
    githubOauth.exchangeCode = async () => "fake-access-token";
    githubOauth.fetchGithubUser = async () => ({ id: "900200", login: "octoExch" });
  });

  test("a handoff code is single-use", async () => {
    const cb = await req("GET", `/v1/auth/github/callback?code=abc&state=${await mintState()}`);
    const handoff = paramFromLocation(cb.headers.get("location"), "code");

    const first = await req("POST", "/v1/auth/github/exchange", { body: { code: handoff } });
    assert.equal(first.status, 200);

    const second = await req("POST", "/v1/auth/github/exchange", { body: { code: handoff } });
    assert.equal(second.status, 400, "a consumed handoff must be rejected");
    assert.equal(second.body.error.code, "OAUTH_STATE_INVALID");
  });

  test("400 for an unknown handoff code", async () => {
    const { status, body } = await req("POST", "/v1/auth/github/exchange", { body: { code: "nope-nope" } });
    assert.equal(status, 400);
    assert.equal(body.error.code, "OAUTH_STATE_INVALID");
  });
});

describe("POST /v1/auth/github/link", () => {
  beforeEach(() => {
    enableGithub();
    githubOauth.exchangeCode = async () => "fake-access-token";
  });

  test("409 GITHUB_ALREADY_LINKED when the identity is bound to another account", async () => {
    const linkedId = "900300";
    githubOauth.fetchGithubUser = async () => ({ id: linkedId, login: "octoLink" });

    const a = await newUserWithToken("gha");
    const b = await newUserWithToken("ghb");

    // Account A binds the identity.
    const linkA = await req("GET", "/v1/auth/github/start"); // mint state
    const stateA = paramFromLocation(linkA.headers.get("location"), "state");
    const resA = await req("POST", `/v1/auth/github/link?code=abc&state=${stateA}`, { token: a.token });
    assert.equal(resA.status, 200);
    assert.equal(resA.body.githubLinked, true);

    // Account B tries to bind the SAME identity → conflict.
    const linkB = await req("GET", "/v1/auth/github/start");
    const stateB = paramFromLocation(linkB.headers.get("location"), "state");
    const resB = await req("POST", `/v1/auth/github/link?code=abc&state=${stateB}`, { token: b.token });
    assert.equal(resB.status, 409);
    assert.equal(resB.body.error.code, "GITHUB_ALREADY_LINKED");
  });

  test("401 when unauthenticated", async () => {
    const state = await mintState();
    const { status } = await req("POST", `/v1/auth/github/link?code=abc&state=${state}`);
    assert.equal(status, 401);
  });
});
