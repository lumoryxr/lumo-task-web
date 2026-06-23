/**
 * Security · Rate limiting
 *
 * The limiter is disabled in the default test env (LUMO_DISABLE_RATE_LIMIT=1)
 * so functional suites aren't throttled. Here we re-enable it at runtime — the
 * middleware reads the flag live on each request (src/lib/rateLimit.ts) — and
 * confirm sensitive endpoints return 429 with the standard error envelope once
 * the per-window threshold is exceeded. Runs in its own process (Node test
 * isolation), so toggling the flag cannot affect other suites.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo } from "../helpers/index.js";

let demoToken = "";
const savedFlag = process.env.LUMO_DISABLE_RATE_LIMIT;

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
  delete process.env.LUMO_DISABLE_RATE_LIMIT; // enable the limiter for this process
});

after(() => {
  if (savedFlag === undefined) delete process.env.LUMO_DISABLE_RATE_LIMIT;
  else process.env.LUMO_DISABLE_RATE_LIMIT = savedFlag;
});

describe("Security · rate-limit · auth (10 / minute / IP)", () => {
  test("the 11th rapid auth attempt is throttled with 429 RATE_LIMITED", async () => {
    const statuses: number[] = [];
    let throttled: any = null;
    for (let i = 0; i < 13; i++) {
      const res = await req("POST", "/v1/auth/signin", {
        body: { email: "ratelimit-probe@test.local", password: "wrong-on-purpose" },
      });
      statuses.push(res.status);
      if (res.status === 429 && !throttled) throttled = res.body;
    }
    // First 10 within the window are not throttled (they 401 on bad creds).
    assert.ok(statuses.slice(0, 10).every((s) => s !== 429), `unexpected early 429: ${statuses}`);
    // The limit (10) is exceeded → at least one 429 appears.
    assert.ok(statuses.includes(429), `expected a 429 after exceeding the limit, got ${statuses}`);
    assert.equal(throttled?.error?.code, "RATE_LIMITED");
    assert.ok(throttled?.error?.message, "429 body should include a message");
  });
});

describe("Security · rate-limit · AI (20 / minute / user)", () => {
  test("rapid AI classify calls are throttled with 429 once the user exceeds the limit", async () => {
    let saw429 = false;
    for (let i = 0; i < 24 && !saw429; i++) {
      const res = await req("POST", "/v1/ai/classify", { token: demoToken, body: {} });
      if (res.status === 429) {
        saw429 = true;
        assert.equal(res.body?.error?.code, "RATE_LIMITED");
      }
    }
    assert.ok(saw429, "expected AI classify to be rate-limited within 24 calls");
  });
});
