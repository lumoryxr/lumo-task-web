/**
 * Rate-limit response headers.
 *
 * A 429 with no `Retry-After` tells the caller "not now" without telling it
 * "when" — so every client guesses, and guesses badly. Ours guessed badly in a
 * specific, observable way: `web-app/src/api/client.ts` retries a 429 on a fixed
 * 300ms/600ms backoff, so against a 60-second auth window it burned both retries
 * inside a second, both of them certain to fail, and surfaced an error to the
 * user that a correct backoff would have avoided entirely.
 *
 * So the limiter now states its budget on every response and the deadline on the
 * ones it rejects, per the `RateLimit-*` convention plus the standard
 * `Retry-After`.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createRateLimiter } from "../../lib/rateLimit.js";

// The shared test env sets LUMO_DISABLE_RATE_LIMIT=1 so unrelated suites aren't
// throttled. These tests are ABOUT the limiter, so they re-enable it for their
// own duration and restore the harness default afterwards.
const disabled = process.env.LUMO_DISABLE_RATE_LIMIT;
before(() => {
  delete process.env.LUMO_DISABLE_RATE_LIMIT;
});
after(() => {
  if (disabled !== undefined) process.env.LUMO_DISABLE_RATE_LIMIT = disabled;
});

/** A tiny app whose single route is limited to `limit` requests per `windowMs`. */
function limitedApp(limit: number, windowMs: number) {
  const app = new Hono();
  app.use("/*", createRateLimiter(limit, windowMs, () => "fixed-key"));
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

describe("Rate limiter · response headers", () => {
  test("an allowed request advertises the limit and what is left", async () => {
    const app = limitedApp(3, 60_000);

    const first = await app.request("/");
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("RateLimit-Limit"), "3");
    assert.equal(first.headers.get("RateLimit-Remaining"), "2");

    const second = await app.request("/");
    assert.equal(second.headers.get("RateLimit-Remaining"), "1");
  });

  test("remaining never goes negative once the budget is spent", async () => {
    const app = limitedApp(1, 60_000);
    await app.request("/");
    const blocked = await app.request("/");

    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("RateLimit-Remaining"), "0");
  });

  test("a rejected request carries Retry-After in whole seconds", async () => {
    const app = limitedApp(1, 60_000);
    await app.request("/");
    const blocked = await app.request("/");

    const retryAfter = blocked.headers.get("Retry-After");
    assert.ok(retryAfter, "429 response has no Retry-After header");

    const seconds = Number(retryAfter);
    assert.ok(Number.isInteger(seconds), `Retry-After must be an integer, got "${retryAfter}"`);
    assert.ok(seconds >= 1 && seconds <= 60, `Retry-After ${seconds}s is outside the window`);
  });

  test("Retry-After rounds up, so it is never a deadline that has not passed yet", async () => {
    // A sub-second remainder floored to 0 would tell the client to retry
    // immediately — straight into another 429.
    const app = limitedApp(1, 300);
    await app.request("/");
    const blocked = await app.request("/");

    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("Retry-After"), "1");
  });

  test("RateLimit-Reset counts down the seconds left in the window", async () => {
    const app = limitedApp(2, 60_000);
    const res = await app.request("/");

    const reset = Number(res.headers.get("RateLimit-Reset"));
    assert.ok(Number.isInteger(reset), "RateLimit-Reset must be an integer number of seconds");
    assert.ok(reset > 0 && reset <= 60, `RateLimit-Reset ${reset}s is outside the window`);
  });

  test("the budget refreshes once the window rolls over", async () => {
    const app = limitedApp(1, 40);
    await app.request("/");
    assert.equal((await app.request("/")).status, 429);

    await new Promise((r) => setTimeout(r, 60));

    const afterWindow = await app.request("/");
    assert.equal(afterWindow.status, 200);
    assert.equal(afterWindow.headers.get("RateLimit-Remaining"), "0");
  });

  test("the error envelope is unchanged", async () => {
    // The headers are additive — the canonical { error: { code, message } }
    // envelope the frontend parses must not shift.
    const app = limitedApp(1, 60_000);
    await app.request("/");
    const blocked = await app.request("/");

    assert.deepEqual(await blocked.json(), {
      error: { code: "RATE_LIMITED", message: "Too many requests. Try again later." },
    });
  });
});

describe("Rate limiter · bookkeeping", () => {
  test("expired entries are reclaimed rather than accumulating", async () => {
    // Each distinct key allocates an entry. Without time-based pruning the map
    // grows with the number of keys ever seen — on a public endpoint keyed by
    // client IP, that is an attacker-controlled memory footprint.
    const seen = new Set<string>();
    const app = new Hono();
    app.use("/*", createRateLimiter(5, 20, (c) => {
      const k = c.req.header("x-key") ?? "anon";
      seen.add(k);
      return k;
    }));
    app.get("/", (c) => c.json({ ok: true }));

    for (let i = 0; i < 250; i++) {
      await app.request("/", { headers: { "x-key": `key-${i}` } });
    }
    await new Promise((r) => setTimeout(r, 40));
    // One more request after every window has expired triggers a prune sweep.
    const res = await app.request("/", { headers: { "x-key": "final" } });

    assert.equal(res.status, 200);
    assert.equal(seen.size, 251);
  });
});
