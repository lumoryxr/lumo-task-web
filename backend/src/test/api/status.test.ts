/**
 * API · Status page
 *   GET /status — public, dependency-free HTML status page (#473). Polls
 *   /health + /ready client-side; unauthenticated like /health.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { setupDb } from "../helpers/index.js";
import { app } from "../../app.js";

before(setupDb);

describe("GET /status (public status page)", () => {
  test("200 → serves HTML without a token", async () => {
    const res = await app.request("/status");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
  });

  test("the page is self-contained and probes /health + /ready", async () => {
    const res = await app.request("/status");
    const html = await res.text();
    assert.match(html, /System status/);
    // Client-side probes both liveness and readiness on the same origin.
    assert.match(html, /fetch\("health"\)|"health"/);
    assert.match(html, /"ready"/);
    // Self-contained: no external script/style/font hosts to break behind a proxy.
    assert.doesNotMatch(html, /src="https?:\/\//);
    assert.doesNotMatch(html, /<link[^>]+href="https?:\/\//);
  });

  test("does not shadow the /health liveness probe", async () => {
    const res = await app.request("/health");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
});
