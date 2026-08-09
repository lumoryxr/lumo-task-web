import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ApiErrorSchema, ERROR_CODES } from "../error.js";

describe("ApiErrorSchema", () => {
  test("parses the standard error envelope", () => {
    const r = ApiErrorSchema.safeParse({ error: { code: "NOT_FOUND", message: "Not found" } });
    assert.equal(r.success, true);
  });

  test("rejects a flat error string", () => {
    assert.equal(ApiErrorSchema.safeParse({ error: "boom" }).success, false);
  });

  test("rejects an envelope missing code", () => {
    assert.equal(ApiErrorSchema.safeParse({ error: { message: "x" } }).success, false);
  });

  test("rejects an envelope missing message", () => {
    assert.equal(ApiErrorSchema.safeParse({ error: { code: "X" } }).success, false);
  });
});

describe("GitHub OAuth error codes (#15)", () => {
  test("registers OAUTH_NOT_CONFIGURED as 501", () => {
    assert.equal(ERROR_CODES.OAUTH_NOT_CONFIGURED.status, 501);
  });

  test("registers OAUTH_STATE_INVALID as 400", () => {
    assert.equal(ERROR_CODES.OAUTH_STATE_INVALID.status, 400);
  });

  test("registers OAUTH_EXCHANGE_FAILED as 502", () => {
    assert.equal(ERROR_CODES.OAUTH_EXCHANGE_FAILED.status, 502);
  });

  test("registers GITHUB_ALREADY_LINKED as 409", () => {
    assert.equal(ERROR_CODES.GITHUB_ALREADY_LINKED.status, 409);
  });
});
