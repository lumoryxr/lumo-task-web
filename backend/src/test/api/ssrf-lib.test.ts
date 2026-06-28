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
import { assertSafeOutboundUrl, isBlockedAddress, SsrfError, safeFetch, makeValidatingLookup } from "../../lib/ssrf.js";

describe("lib/ssrf · IPv4-in-IPv6 forms (the hex-normalized bypass)", () => {
  // new URL("http://[::ffff:127.0.0.1]") normalizes to the hex form below
  const blocked = [
    "::ffff:7f00:1",        // hex-mapped 127.0.0.1
    "::ffff:a9fe:a9fe",     // hex-mapped 169.254.169.254 (cloud metadata)
    "::ffff:127.0.0.1",     // dotted-mapped loopback
    "64:ff9b::7f00:1",      // NAT64 127.0.0.1
    "64:ff9b::a9fe:a9fe",   // NAT64 metadata
    "::7f00:1",             // IPv4-compatible loopback
    "::ffff:10.0.0.1",      // mapped RFC1918
  ];
  for (const ip of blocked) test(`blocks ${ip}`, () => assert.equal(isBlockedAddress(ip), true));

  // a v4-in-v6 form embedding a PUBLIC address must NOT be over-blocked
  const allowed = ["::ffff:8.8.8.8", "::ffff:0808:0808", "64:ff9b::8.8.8.8"];
  for (const ip of allowed) test(`allows public-embedded ${ip}`, () => assert.equal(isBlockedAddress(ip), false));

  test("assertSafeOutboundUrl rejects the URL-normalized hex-mapped loopback", async () => {
    await assert.rejects(() => assertSafeOutboundUrl("http://[::ffff:127.0.0.1]/v1", false), SsrfError);
    await assert.rejects(() => assertSafeOutboundUrl("http://[::ffff:169.254.169.254]/", false), SsrfError);
  });
});

describe("lib/ssrf · safeFetch redirect re-validation", () => {
  const ok = (status = 200) => new Response("body", { status });
  const redirect = (loc: string) => new Response(null, { status: 302, headers: { location: loc } });

  test("follows a redirect to a public host and returns the final response", async () => {
    const seq = [redirect("https://api.openai.com/final"), ok(200)];
    let i = 0;
    const res = await safeFetch("https://api.openai.com/v1", {}, false, undefined, async () => seq[i++]);
    assert.equal(res.status, 200);
    assert.equal(i, 2); // initial + one redirect followed
  });

  test("REFUSES a redirect to cloud metadata (the P0 bypass)", async () => {
    const calls: string[] = [];
    const fake = async (u: string) => { calls.push(u); return redirect("http://169.254.169.254/latest/meta-data/"); };
    await assert.rejects(
      () => safeFetch("https://api.openai.com/v1", {}, false, undefined, fake),
      SsrfError,
    );
    // it must NOT have connected to the metadata host (only the initial public URL)
    assert.deepEqual(calls, ["https://api.openai.com/v1"]);
  });

  test("REFUSES a redirect to loopback", async () => {
    const fake = async () => redirect("http://127.0.0.1:8080/");
    await assert.rejects(() => safeFetch("https://api.openai.com/v1", {}, false, undefined, fake), SsrfError);
  });

  test("caps redirect chains", async () => {
    const fake = async () => redirect("https://api.openai.com/loop");
    await assert.rejects(() => safeFetch("https://api.openai.com/v1", {}, false, undefined, fake), /Too many redirects/);
  });

  test("returns a non-redirect response directly", async () => {
    const res = await safeFetch("https://api.openai.com/v1", {}, false, undefined, async () => ok(201));
    assert.equal(res.status, 201);
  });
});

describe("lib/ssrf · makeValidatingLookup (connect-time DNS-rebind guard)", () => {
  // Fake resolver matching node:dns.lookup(host, {all:true}, cb) shape.
  const resolverReturning = (addrs: { address: string; family: number }[]) =>
    ((_host: string, _opts: any, cb: any) => cb(null, addrs)) as any;
  const resolverError = ((_host: string, _opts: any, cb: any) =>
    cb(new Error("ENOTFOUND"))) as any;

  const run = (lookup: any, opts: any): Promise<{ err: any; address?: any; family?: any }> =>
    new Promise((resolve) =>
      lookup("evil.example.com", opts, (err: any, address: any, family: any) =>
        resolve({ err, address, family }),
      ),
    );

  test("connects to a validated public address (single-address form)", async () => {
    const lookup = makeValidatingLookup(resolverReturning([{ address: "93.184.216.34", family: 4 }]));
    const { err, address, family } = await run(lookup, { family: 0 });
    assert.equal(err, null);
    assert.equal(address, "93.184.216.34");
    assert.equal(family, 4);
  });

  test("REFUSES when the host resolves to cloud metadata (the rebind attack)", async () => {
    const lookup = makeValidatingLookup(resolverReturning([{ address: "169.254.169.254", family: 4 }]));
    const { err } = await run(lookup, {});
    assert.ok(err instanceof SsrfError);
  });

  test("REFUSES if ANY resolved address is internal (mixed answer)", async () => {
    const lookup = makeValidatingLookup(
      resolverReturning([{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.5", family: 4 }]),
    );
    const { err } = await run(lookup, {});
    assert.ok(err instanceof SsrfError);
  });

  test("returns the full validated list when {all:true} is requested", async () => {
    const addrs = [{ address: "1.1.1.1", family: 4 }, { address: "8.8.8.8", family: 4 }];
    const lookup = makeValidatingLookup(resolverReturning(addrs));
    const { err, address } = await run(lookup, { all: true });
    assert.equal(err, null);
    assert.deepEqual(address, addrs);
  });

  test("propagates resolver errors", async () => {
    const lookup = makeValidatingLookup(resolverError);
    const { err } = await run(lookup, {});
    assert.ok(err instanceof Error);
  });

  test("rejects an empty resolution", async () => {
    const lookup = makeValidatingLookup(resolverReturning([]));
    const { err } = await run(lookup, {});
    assert.ok(err instanceof SsrfError);
  });
});

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
