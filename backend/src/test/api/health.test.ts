/**
 * API · Health & readiness
 *   GET /health  — shallow liveness (no DB; Render healthCheckPath)
 *   GET /ready   — deep readiness (verifies DB connectivity)
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb } from "../helpers/index.js";
import { db } from "../../db/client.js";

before(setupDb);

describe("GET /health (liveness)", () => {
  test("200 → { ok: true } without touching the DB", async () => {
    const { status, body } = await req("GET", "/health");
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });
});

describe("GET /ready (readiness)", () => {
  test("200 → { ok: true, db: 'up' } when the DB is reachable", async () => {
    const { status, body } = await req("GET", "/ready");
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.db, "up");
  });

  // Must run last in this (isolated) process: closing the client makes every
  // subsequent query throw, exercising the unreachable-DB path. Liveness must
  // stay 200 even then (process is up); only readiness flips to 503.
  test("liveness stays 200 but readiness returns 503 when the DB is down", async () => {
    db.close();
    const live = await req("GET", "/health");
    assert.equal(live.status, 200);
    const ready = await req("GET", "/ready");
    assert.equal(ready.status, 503);
    assert.equal(ready.body.ok, false);
    assert.equal(ready.body.db, "down");
  });
});
