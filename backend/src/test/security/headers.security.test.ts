/**
 * Security · Response hardening headers
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { req } from "../helpers/index.js";

describe("security response headers", () => {
  test("baseline hardening headers are present on every response", async () => {
    const { headers } = await req("GET", "/health");
    assert.equal(headers.get("x-content-type-options"), "nosniff");
    assert.equal(headers.get("x-frame-options"), "DENY");
    assert.equal(headers.get("referrer-policy"), "no-referrer");
    assert.match(headers.get("strict-transport-security") ?? "", /max-age=\d+/);
  });
});
