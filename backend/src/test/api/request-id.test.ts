/**
 * API · request correlation (x-request-id) + structured logger.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb } from "../helpers/index.js";
import { resolveRequestId, resolveTraceContext, runWithCorrelation, log } from "../../lib/logger.js";

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

describe("W3C trace context propagation", () => {
  const TP_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

  test("every response carries a well-formed traceparent + x-trace-id", async () => {
    const { headers } = await req("GET", "/health");
    const tp = headers.get("traceparent") ?? "";
    const m = tp.match(TP_RE);
    assert.ok(m, `traceparent should be well-formed, got: ${tp}`);
    // x-trace-id mirrors the trace id inside traceparent.
    assert.equal(headers.get("x-trace-id"), m![1]);
  });

  test("a valid inbound traceparent continues the trace (same trace id, new span id)", async () => {
    const traceId = "0af7651916cd43dd8448eb211c80319c";
    const parentSpan = "b7ad6b7169203331";
    const inbound = `00-${traceId}-${parentSpan}-01`;
    const { headers } = await req("GET", "/health", { headers: { traceparent: inbound } });
    const m = (headers.get("traceparent") ?? "").match(TP_RE)!;
    assert.equal(m[1], traceId, "trace id is continued from the inbound header");
    assert.notEqual(m[2], parentSpan, "a fresh span id is minted for this hop");
    assert.equal(headers.get("x-trace-id"), traceId);
  });

  test("a malformed traceparent is not trusted — a fresh trace is started", async () => {
    const { headers } = await req("GET", "/health", { headers: { traceparent: "garbage" } });
    const m = (headers.get("traceparent") ?? "").match(TP_RE);
    assert.ok(m, "a fresh, well-formed traceparent is emitted");
    assert.notEqual(m![1], "garbage");
  });
});

describe("resolveTraceContext", () => {
  test("continues a valid inbound traceparent with a new span id", () => {
    const tc = resolveTraceContext("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
    assert.equal(tc.traceId, "0af7651916cd43dd8448eb211c80319c");
    assert.notEqual(tc.spanId, "b7ad6b7169203331");
    assert.match(tc.spanId, /^[0-9a-f]{16}$/);
    assert.equal(tc.flags, "01");
  });

  test("starts a fresh trace for absent/malformed/all-zero input", () => {
    for (const bad of [undefined, "", "nope", "00-" + "0".repeat(32) + "-" + "0".repeat(16) + "-01"]) {
      const tc = resolveTraceContext(bad as string | undefined);
      assert.match(tc.traceId, /^[0-9a-f]{32}$/);
      assert.notEqual(tc.traceId, "0".repeat(32));
      assert.match(tc.spanId, /^[0-9a-f]{16}$/);
    }
  });
});

describe("log() correlation via AsyncLocalStorage", () => {
  test("auto-stamps trace_id/span_id/requestId from the request scope", () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (l: string) => lines.push(l);
    try {
      runWithCorrelation({ requestId: "r9", traceId: "t".repeat(32), spanId: "s".repeat(16) }, () => {
        log("info", { msg: "inside scope" });
      });
    } finally {
      console.log = orig;
    }
    const o = JSON.parse(lines[0]);
    assert.equal(o.requestId, "r9");
    assert.equal(o.traceId, "t".repeat(32));
    assert.equal(o.spanId, "s".repeat(16));
    assert.equal(o.msg, "inside scope");
  });

  test("an explicit field overrides the scoped value", () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (l: string) => lines.push(l);
    try {
      runWithCorrelation({ requestId: "scoped" }, () => log("info", { requestId: "explicit" }));
    } finally {
      console.log = orig;
    }
    assert.equal(JSON.parse(lines[0]).requestId, "explicit");
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
