/**
 * API · Prometheus metrics exporter (GET /metrics)
 *
 * Self-hosted scrape endpoint — no outward integration. Verifies it is
 * disabled-by-default, token-gated when enabled, emits our HTTP series, and
 * never leaks raw ids into route labels (cardinality/PII guard).
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupDb } from "../helpers/index.js";
import { app } from "../../app.js";

const TOKEN = "test-metrics-token-abc123";

async function scrape(headers: Record<string, string> = {}) {
  const res = await app.request("/metrics", { method: "GET", headers });
  return { status: res.status, text: await res.text(), contentType: res.headers.get("content-type") };
}

before(async () => {
  await setupDb();
});

describe("GET /metrics", () => {
  test("is disabled (404) when LUMO_METRICS_TOKEN is unset", async () => {
    delete process.env.LUMO_METRICS_TOKEN;
    assert.equal((await scrape()).status, 404);
  });

  describe("with LUMO_METRICS_TOKEN configured", () => {
    before(() => {
      process.env.LUMO_METRICS_TOKEN = TOKEN;
    });
    after(() => {
      delete process.env.LUMO_METRICS_TOKEN;
    });

    test("401 when no bearer token is presented", async () => {
      assert.equal((await scrape()).status, 401);
    });

    test("401 when the wrong bearer token is presented", async () => {
      assert.equal((await scrape({ Authorization: "Bearer nope" })).status, 401);
    });

    test("200 + Prometheus text with the correct token; includes the HTTP series", async () => {
      // Drive some traffic first so the counters have observations.
      await app.request("/health");
      await app.request("/v1/tasks"); // 401 (unauth) — still counted
      const r = await scrape({ Authorization: `Bearer ${TOKEN}` });
      assert.equal(r.status, 200);
      assert.match(r.contentType ?? "", /text\/plain/);
      assert.match(r.text, /lumo_http_requests_total/);
      assert.match(r.text, /lumo_http_request_duration_seconds/);
      assert.match(r.text, /lumo_http_requests_in_flight/);
    });

    test("route labels are bounded patterns — a raw id never appears as a label", async () => {
      await app.request("/v1/tasks/some-unique-id-9876543210");
      const r = await scrape({ Authorization: `Bearer ${TOKEN}` });
      assert.equal(r.status, 200);
      assert.equal(
        r.text.includes("some-unique-id-9876543210"),
        false,
        "the raw task id leaked into a metric label (cardinality/PII risk)",
      );
    });
  });
});
