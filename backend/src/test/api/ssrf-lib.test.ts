/**
 * Unit · SSRF address/URL classification (lib/ssrf)
 *
 * Lives in the coverage-measured api suite so the security-critical
 * private-range and scheme logic is exercised by the coverage gate, not only by
 * the security suite. Endpoint-level enforcement is covered in
 * security/ssrf.security.test.ts.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assertSafeOutboundUrl, isBlockedAddress, SsrfError } from "../../lib/ssrf.js";

describe("lib/ssrf · isBlockedAddress", () => {
  const blocked = [
    "127.0.0.1", "0.0.0.0", "10.1.2.3", "172.16.5.5", "192.168.0.1",
    "169.254.169.254", "100.64.0.1",
    "::1", "::", "fe80::1", "fec0::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1",
  ];
  for (const ip of blocked) test(`blocks ${ip}`, () => assert.equal(isBlockedAddress(ip), true));

  const allowed = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"];
  for (const ip of allowed) test(`allows ${ip}`, () => assert.equal(isBlockedAddress(ip), false));

  test("malformed octet (>255) is not treated as a valid v4 literal", () => {
    assert.equal(isBlockedAddress("999.1.1.1"), false);
  });
});

describe("lib/ssrf · assertSafeOutboundUrl", () => {
  test("blocks metadata/loopback/private in enforced mode", async () => {
    for (const u of ["http://169.254.169.254/", "http://127.0.0.1/", "https://10.0.0.1/", "http://localhost/"]) {
      await assert.rejects(() => assertSafeOutboundUrl(u, false), SsrfError);
    }
  });
  test("rejects disallowed schemes", async () => {
    await assert.rejects(() => assertSafeOutboundUrl("file:///etc/passwd", false), SsrfError);
    await assert.rejects(() => assertSafeOutboundUrl("ftp://example.com/", false), SsrfError);
  });
  test("rejects malformed URL", async () => {
    await assert.rejects(() => assertSafeOutboundUrl("::::", false), SsrfError);
  });
  test("allows public host in enforced mode", async () => {
    await assert.doesNotReject(() => assertSafeOutboundUrl("https://api.openai.com/v1", false));
  });
  test("allowPrivate permits localhost/LAN but keeps scheme allowlist", async () => {
    await assert.doesNotReject(() => assertSafeOutboundUrl("http://localhost:11434", true));
    await assert.doesNotReject(() => assertSafeOutboundUrl("http://192.168.1.10", true));
    await assert.rejects(() => assertSafeOutboundUrl("file:/x", true), SsrfError);
  });
  test("custom scheme allowlist (libsql) blocks private literal host", async () => {
    const s = new Set(["https:", "libsql:"]);
    await assert.doesNotReject(() => assertSafeOutboundUrl("libsql://db.turso.io", false, s));
    await assert.rejects(() => assertSafeOutboundUrl("libsql://10.0.0.1", false, s), SsrfError);
  });
});
