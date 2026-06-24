/**
 * Security · Input validation (defense-in-depth)
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo } from "../helpers/index.js";

let token = "";

before(async () => {
  await setupDb();
  ({ token } = await signInDemo());
});

describe("GET /v1/completed date param", () => {
  test("rejects a malformed date with 400", async () => {
    const { status } = await req("GET", "/v1/completed?date=not-a-date", { token });
    assert.equal(status, 400);
  });

  test("accepts a well-formed YYYY-MM-DD date", async () => {
    const { status } = await req("GET", "/v1/completed?date=2026-06-23", { token });
    assert.equal(status, 200);
  });
});
