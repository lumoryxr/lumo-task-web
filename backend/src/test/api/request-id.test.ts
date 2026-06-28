/**
 * API · request correlation (x-request-id) + structured logger.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb } from "../helpers/index.js";
import { resolveRequestId, log } from "../../lib/logger.js";

before(async () => {
  await setupDb();
});

describe("request correlation", () => {
  test("every response carries an x-request-id header", async () => {
    const { headers } = await req("GET", "/health");
    const id = headers.get("x-request-id");
    assert.ok(id && id.length > 0, "x-request-id header should be present");
  });

  test("a safe inbound x-request-id is echoed back (trace continuity)", async () => {
    const trace = "trace-abc_123.45";
    const { headers } = await req("GET", "/health", { headers: { "x-request-id": trace } });
    assert.equal(headers.get("x-request-id"), trace);
  });

  test("an unsafe inbound x-request-id is replaced, not trusted", async () => {
    // Spaces are a legal header value but fail the safe-token check → replaced.
    const evil = "bad id with spaces";
    const { headers } = await req("GET", "/health", { headers: { "x-request-id": evil } });
    const id = headers.get("x-request-id");
    assert.notEqual(id, evil);
    assert.ok(id && /^[A-Za-z0-9_.-]+$/.test(id), "replacement id should be a safe token");
  });
});

describe("resolveRequestId", () => {
  test("accepts a short safe token", () => {
    assert.equal(resolveRequestId("abc-123_.x"), "abc-123_.x");
  });

  test("rejects spaces / control chars and generates a fresh id", () => {
    const out = resolveRequestId("has space");
    assert.notEqual(out, "has space");
    assert.ok(out.length > 0);
  });

  test("rejects an over-long token (>128 chars)", () => {
    const long = "a".repeat(129);
    assert.notEqual(resolveRequestId(long), long);
  });

  test("generates an id for empty/undefined input", () => {
    assert.ok(resolveRequestId(undefined).length > 0);
    assert.ok(resolveRequestId("").length > 0);
  });
});

describe("structured log()", () => {
  test("emits a single parseable JSON line with level + ts + fields", () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (l: string) => lines.push(l);
    try {
      log("info", { requestId: "r1", status: 200 });
    } finally {
      console.log = orig;
    }
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.level, "info");
    assert.equal(parsed.requestId, "r1");
    assert.equal(parsed.status, 200);
    assert.ok(typeof parsed.ts === "string");
  });

  test("error level goes to stderr", () => {
    const lines: string[] = [];
    const orig = console.error;
    console.error = (l: string) => lines.push(l);
    try {
      log("error", { msg: "boom" });
    } finally {
      console.error = orig;
    }
    assert.equal(JSON.parse(lines[0]).level, "error");
  });
});
