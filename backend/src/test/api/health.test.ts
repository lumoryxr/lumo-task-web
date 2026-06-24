/**
 * API · Health
 *   GET /health  (deep check — verifies DB connectivity)
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb } from "../helpers/index.js";
import { db } from "../../db/client.js";

before(setupDb);

describe("GET /health", () => {
  test("200 → { ok: true, db: 'up' } when the DB is reachable", async () => {
    const { status, body } = await req("GET", "/health");
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.db, "up");
  });

  // Must run last in this (isolated) process: closing the client makes every
  // subsequent query throw, exercising the unreachable-DB path.
  test("503 → { ok: false, db: 'down' } when the DB is unreachable", async () => {
    db.close();
    const { status, body } = await req("GET", "/health");
    assert.equal(status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.db, "down");
  });
});
