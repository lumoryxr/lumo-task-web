/**
 * Unit · trusted-proxy client IP resolution (lib/clientIp)
 */
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getClientIp, trustedProxyHops } from "../../lib/clientIp.js";

const ORIG = process.env.LUMO_TRUSTED_PROXY_HOPS;
afterEach(() => { process.env.LUMO_TRUSTED_PROXY_HOPS = ORIG; });

function ctx(headers: Record<string, string>) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { req: { header: (n: string) => lower[n.toLowerCase()] } };
}

describe("lib/clientIp", () => {
  test("default 1 hop → uses the right-most (proxy-appended) XFF entry", () => {
    // attacker prepends a spoofed IP; the real peer is appended last by our proxy
    const ip = getClientIp(ctx({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }));
    assert.equal(ip, "203.0.113.9");
  });

  test("spoofed single-entry XFF is taken at face value only when no extra hop", () => {
    // direct client with one proxy: the proxy appends, so a lone entry is the peer
    assert.equal(getClientIp(ctx({ "x-forwarded-for": "198.51.100.7" })), "198.51.100.7");
  });

  test("rotating the left side does not change the resolved IP", () => {
    const a = getClientIp(ctx({ "x-forwarded-for": "9.9.9.9, 203.0.113.9" }));
    const b = getClientIp(ctx({ "x-forwarded-for": "7.7.7.7, 203.0.113.9" }));
    assert.equal(a, b);
    assert.equal(a, "203.0.113.9");
  });

  test("honors LUMO_TRUSTED_PROXY_HOPS=2", () => {
    process.env.LUMO_TRUSTED_PROXY_HOPS = "2";
    assert.equal(trustedProxyHops(), 2);
    const ip = getClientIp(ctx({ "x-forwarded-for": "1.1.1.1, 203.0.113.9, 10.0.0.1" }));
    assert.equal(ip, "203.0.113.9");
  });

  test("falls back to x-real-ip then 'unknown'", () => {
    assert.equal(getClientIp(ctx({ "x-real-ip": "192.0.2.5" })), "192.0.2.5");
    assert.equal(getClientIp(ctx({})), "unknown");
  });

  test("invalid hop value falls back to 1", () => {
    process.env.LUMO_TRUSTED_PROXY_HOPS = "abc";
    assert.equal(trustedProxyHops(), 1);
  });
});
