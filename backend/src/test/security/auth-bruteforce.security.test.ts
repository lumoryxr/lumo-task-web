/**
 * Security · Login brute-force hardening
 *
 * 1. The auth rate limiter must key on the trusted-proxy-resolved client IP, so
 *    an attacker cannot defeat it by rotating a spoofed X-Forwarded-For prefix.
 * 2. Sign-in must take constant-ish time whether or not the account exists, so
 *    response latency can't be used to enumerate registered emails.
 *
 * Runs in its own process (Node test isolation) so re-enabling the limiter and
 * tweaking env here cannot affect other suites.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb } from "../helpers/index.js";

const savedFlag = process.env.LUMO_DISABLE_RATE_LIMIT;

before(async () => {
  await setupDb();
  delete process.env.LUMO_DISABLE_RATE_LIMIT; // enable limiter for this process
});
after(() => {
  if (savedFlag === undefined) delete process.env.LUMO_DISABLE_RATE_LIMIT;
  else process.env.LUMO_DISABLE_RATE_LIMIT = savedFlag;
});

describe("Security · login brute-force · XFF spoofing", () => {
  test("rotating the spoofed XFF prefix does NOT bypass the per-IP limit", async () => {
    const realPeer = "203.0.113.77"; // appended by our trusted proxy (right-most)
    const statuses: number[] = [];
    for (let i = 0; i < 13; i++) {
      const res = await req("POST", "/v1/auth/signin", {
        body: { email: "spoof-probe@test.local", password: "nope" },
        // attacker changes the LEFT entry on every request; the trusted peer is constant
        headers: { "x-forwarded-for": `10.0.0.${i}, ${realPeer}` },
      });
      statuses.push(res.status);
    }
    assert.ok(
      statuses.includes(429),
      `rotating XFF should still hit the same bucket and get throttled, got ${statuses}`,
    );
  });

  test("distinct real peers get independent buckets (no false throttling)", async () => {
    const a = await req("POST", "/v1/auth/signin", {
      body: { email: "x@test.local", password: "nope" },
      headers: { "x-forwarded-for": `1.1.1.1, 198.51.100.10` },
    });
    const b = await req("POST", "/v1/auth/signin", {
      body: { email: "x@test.local", password: "nope" },
      headers: { "x-forwarded-for": `1.1.1.1, 198.51.100.11` },
    });
    assert.notEqual(a.status, 429);
    assert.notEqual(b.status, 429);
  });
});

describe("Security · login timing · account enumeration", () => {
  test("sign-in for a non-existent account still performs a password comparison", async () => {
    // fresh peer IP so this request isn't pre-throttled by the suite above
    const headers = { "x-forwarded-for": "192.0.2.200" };
    const t0 = process.hrtime.bigint();
    const res = await req("POST", "/v1/auth/signin", {
      body: { email: `ghost-${Date.now()}@nowhere.test`, password: "whatever123" },
      headers,
    });
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.equal(res.status, 401);
    // bcrypt cost-12 verify is reliably tens of ms; without the dummy compare the
    // no-user path returns in ~1ms, so this proves equal work is done.
    assert.ok(elapsedMs >= 25, `expected a dummy bcrypt compare (>=25ms), took ${elapsedMs.toFixed(1)}ms`);
  });
});
