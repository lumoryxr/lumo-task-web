/**
 * Security · SSRF guard for user-controlled outbound URLs
 *
 * Verifies that in hosted (cloud) mode the server refuses to fetch internal /
 * loopback / link-local / cloud-metadata destinations, while desktop mode keeps
 * localhost reachable for self-hosted LLMs.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { assertSafeOutboundUrl, isBlockedAddress, SsrfError } from "../../lib/ssrf.js";
import { req, signInDemo, setupDb } from "../helpers/index.js";

describe("ssrf: blocked address classification", () => {
  const blocked = [
    "127.0.0.1", "0.0.0.0", "10.1.2.3", "172.16.5.5", "172.31.255.255",
    "192.168.0.1", "169.254.169.254", "100.64.0.1", "::1",
    "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1",
  ];
  for (const ip of blocked) {
    test(`blocks ${ip}`, () => assert.equal(isBlockedAddress(ip), true));
  }

  const allowed = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"];
  for (const ip of allowed) {
    test(`allows public ${ip}`, () => assert.equal(isBlockedAddress(ip), false));
  }
});

describe("ssrf: assertSafeOutboundUrl (cloud / enforced mode)", () => {
  const enforced = (u: string, schemes?: Set<string>) =>
    assertSafeOutboundUrl(u, false, schemes);

  test("rejects cloud metadata IP", async () => {
    await assert.rejects(() => enforced("http://169.254.169.254/latest/meta-data/"), SsrfError);
  });
  test("rejects loopback literal", async () => {
    await assert.rejects(() => enforced("http://127.0.0.1:8080/x"), SsrfError);
  });
  test("rejects localhost hostname", async () => {
    await assert.rejects(() => enforced("http://localhost:11434/v1"), SsrfError);
  });
  test("rejects private RFC1918 literal", async () => {
    await assert.rejects(() => enforced("https://10.0.0.5/api"), SsrfError);
  });
  test("rejects non-http scheme (file:)", async () => {
    await assert.rejects(() => enforced("file:///etc/passwd"), SsrfError);
  });
  test("rejects malformed URL", async () => {
    await assert.rejects(() => enforced("not a url"), SsrfError);
  });
  test("allows a public https URL", async () => {
    await assert.doesNotReject(() => enforced("https://api.openai.com/v1"));
  });
  test("honors a custom scheme allowlist (libsql) and still blocks file:", async () => {
    const schemes = new Set(["https:", "libsql:"]);
    await assert.doesNotReject(() => enforced("libsql://db.turso.io", schemes));
    await assert.rejects(() => enforced("file:/tmp/x.db", schemes), SsrfError);
  });
});

describe("ssrf: assertSafeOutboundUrl (desktop / allowPrivate mode)", () => {
  test("allows localhost when private is permitted (self-hosted LLM)", async () => {
    await assert.doesNotReject(() => assertSafeOutboundUrl("http://localhost:11434/v1", true));
  });
  test("allows a LAN address when private is permitted", async () => {
    await assert.doesNotReject(() => assertSafeOutboundUrl("http://192.168.1.50:1234", true));
  });
  test("still enforces the scheme allowlist in desktop mode", async () => {
    await assert.rejects(() => assertSafeOutboundUrl("file:///etc/passwd", true), SsrfError);
  });
});

describe("ssrf: route enforcement (hosted mode — TURSO_DATABASE_URL set in test env)", () => {
  before(setupDb);

  test("PATCH /settings rejects an AI baseUrl pointing at cloud metadata", async () => {
    const { token } = await signInDemo();
    const { status, body } = await req("PATCH", "/v1/settings", {
      token,
      body: { ai_configs_update: { provider: "custom", key: "x", baseUrl: "http://169.254.169.254/latest/meta-data/" } },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, "INVALID_BASE_URL");
  });

  test("PATCH /settings rejects an AI baseUrl pointing at loopback", async () => {
    const { token } = await signInDemo();
    const { status, body } = await req("PATCH", "/v1/settings", {
      token,
      body: { ai_configs_update: { provider: "custom", key: "x", baseUrl: "http://127.0.0.1:8080/v1" } },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, "INVALID_BASE_URL");
  });

  test("PATCH /settings accepts a public AI baseUrl", async () => {
    const { token } = await signInDemo();
    const { status } = await req("PATCH", "/v1/settings", {
      token,
      body: { ai_configs_update: { provider: "custom", key: "x", baseUrl: "https://api.openai.com/v1" } },
    });
    assert.equal(status, 200);
  });
  // NOTE: the /storage/remote-config SSRF tests were removed with that endpoint
  // (ADR-0003 Phase 5 — legacy manual remote sync deleted). The AI baseUrl SSRF
  // guard above still exercises lib/ssrf, which remains in use.
});
