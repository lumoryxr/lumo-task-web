/**
 * Unit · app base URL resolution (lib/appBaseUrl)
 *
 * Guards the fix that removed the hard-coded production URL: env wins, else the
 * origin is derived from the (proxied) request — never a baked-in domain.
 */
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { appBaseUrl, requestOrigin } from "../../lib/appBaseUrl.js";

const ORIG = process.env.LUMO_APP_BASE_URL;
afterEach(() => {
  if (ORIG === undefined) delete process.env.LUMO_APP_BASE_URL;
  else process.env.LUMO_APP_BASE_URL = ORIG;
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

  test("no env → derives from x-forwarded-proto + x-forwarded-host (behind a proxy)", () => {
    delete process.env.LUMO_APP_BASE_URL;
    const base = appBaseUrl(ctx({ "x-forwarded-proto": "https", "x-forwarded-host": "lumo.mydomain.org" }));
    assert.equal(base, "https://lumo.mydomain.org");
  });

  test("no env → falls back to the Host header when no forwarded host", () => {
    delete process.env.LUMO_APP_BASE_URL;
    assert.equal(appBaseUrl(ctx({ host: "direct.example:8080" })), "https://direct.example:8080");
  });

  test("proto defaults to https when no x-forwarded-proto is present", () => {
    assert.equal(requestOrigin(ctx({ host: "h.example" })), "https://h.example");
  });

  test("comma-listed forwarded headers use the first token", () => {
    const base = requestOrigin(ctx({
      "x-forwarded-proto": "https, http",
      "x-forwarded-host": "first.example, second.example",
    }));
    assert.equal(base, "https://first.example");
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
