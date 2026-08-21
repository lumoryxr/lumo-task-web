/**
 * Unit · app base URL resolution (lib/appBaseUrl)
 *
 * Guards the fix that removed the hard-coded production URL: env wins, else the
 * origin is derived from the (proxied) request — never a baked-in domain — using
 * the SAME trusted-proxy model as lib/clientIp (right-most entry, not left-most).
 */
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { appBaseUrl, requestOrigin } from "../../lib/appBaseUrl.js";

const ORIG = process.env.LUMO_APP_BASE_URL;
const ORIG_HOPS = process.env.LUMO_TRUSTED_PROXY_HOPS;
afterEach(() => {
  if (ORIG === undefined) delete process.env.LUMO_APP_BASE_URL;
  else process.env.LUMO_APP_BASE_URL = ORIG;
  if (ORIG_HOPS === undefined) delete process.env.LUMO_TRUSTED_PROXY_HOPS;
  else process.env.LUMO_TRUSTED_PROXY_HOPS = ORIG_HOPS;
});

function ctx(headers: Record<string, string>) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { req: { header: (n: string) => lower[n.toLowerCase()] } };
}

describe("lib/appBaseUrl", () => {
  test("explicit LUMO_APP_BASE_URL wins and is stripped of trailing slashes", () => {
    process.env.LUMO_APP_BASE_URL = "https://app.example.com/";
    assert.equal(appBaseUrl(ctx({ host: "ignored.example" })), "https://app.example.com");
  });

  test("empty/whitespace LUMO_APP_BASE_URL is treated as unset → derives from request", () => {
    // deploy/vps/.env.example ships the key with an empty value, so this is the
    // most common real-world shape — it must NOT yield a blank base URL.
    process.env.LUMO_APP_BASE_URL = "   ";
    assert.equal(appBaseUrl(ctx({ "x-forwarded-host": "derived.example" })), "https://derived.example");
  });

  test("no env → derives from x-forwarded-proto + x-forwarded-host (behind a proxy)", () => {
    delete process.env.LUMO_APP_BASE_URL;
    const base = appBaseUrl(ctx({ "x-forwarded-proto": "https", "x-forwarded-host": "lumo.mydomain.org" }));
    assert.equal(base, "https://lumo.mydomain.org");
  });

  test("no env → falls back to the Host header when no forwarded host", () => {
    delete process.env.LUMO_APP_BASE_URL;
    assert.equal(appBaseUrl(ctx({ host: "direct.example:8080" })), "https://direct.example:8080");
  });

  test("comma-listed forwarded headers use the RIGHT-most (proxy-inserted) token, not the spoofable left", () => {
    delete process.env.LUMO_APP_BASE_URL;
    // An attacker prepends attacker.com; our single proxy appends the real host.
    const base = requestOrigin(ctx({
      "x-forwarded-proto": "http, https",
      "x-forwarded-host": "attacker.com, real.example",
    }));
    assert.equal(base, "https://real.example");
  });

  test("honors LUMO_TRUSTED_PROXY_HOPS when picking the forwarded host", () => {
    delete process.env.LUMO_APP_BASE_URL;
    process.env.LUMO_TRUSTED_PROXY_HOPS = "2";
    const base = requestOrigin(ctx({ "x-forwarded-host": "spoof.com, real.example, inner.local" }));
    assert.equal(base, "https://real.example");
  });

  test("loopback host defaults to http (avoids an unreachable https link in dev)", () => {
    delete process.env.LUMO_APP_BASE_URL;
    assert.equal(requestOrigin(ctx({ host: "localhost:3000" })), "http://localhost:3000");
    assert.equal(requestOrigin(ctx({ host: "127.0.0.1:5173" })), "http://127.0.0.1:5173");
  });

  test("never returns the old hard-coded onrender fallback", () => {
    delete process.env.LUMO_APP_BASE_URL;
    const base = appBaseUrl(ctx({ host: "self-hosted.example" }));
    assert.ok(!base.includes("onrender.com"), "must not leak a baked-in domain");
    assert.equal(base, "https://self-hosted.example");
  });

  test("returns empty origin when no host can be determined (last resort)", () => {
    delete process.env.LUMO_APP_BASE_URL;
    assert.equal(appBaseUrl(ctx({})), "");
  });
});
