/**
 * SSRF protection for user-controlled outbound URLs (AI provider base URLs,
 * remote sync targets).
 *
 * Threat model: in the hosted multi-tenant deployment (cloud mode) any
 * authenticated user can set a URL the server will then fetch — pointing it at
 * cloud metadata (169.254.169.254), localhost, or internal RFC1918 ranges turns
 * the server into a confused deputy and can leak credentials forwarded in the
 * request. We therefore block private / loopback / link-local / metadata
 * destinations for hosted deployments.
 *
 * In local / embedded-replica mode the "server" is the user's own desktop, so
 * pointing the AI base URL at http://localhost:11434 (e.g. a self-hosted Ollama)
 * is legitimate and must keep working. Callers pass `allowPrivate` accordingly
 * (derived from dbMode()).
 */
import { lookup } from "node:dns/promises";
import { lookup as lookupCb } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/** Parse an IPv4 dotted-quad into its 32-bit integer, or null if not IPv4. */
function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inV4Range(ipInt: number, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

// Blocked IPv4 ranges: loopback, this-host, RFC1918 private, link-local
// (incl. cloud metadata 169.254.169.254), CGNAT, and benchmark/reserved.
const BLOCKED_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
];

/**
 * Extract the embedded IPv4 address from the v4-in-v6 forms that resolvers will
 * happily route — IPv4-mapped (::ffff:a.b.c.d / hex ::ffff:HHHH:HHHH),
 * NAT64 (64:ff9b::…), and the deprecated IPv4-compatible (::a.b.c.d / ::HHHH:HHHH).
 * `new URL()` normalises `[::ffff:127.0.0.1]` to the *hex* form `::ffff:7f00:1`,
 * so matching only the dotted form (as the original guard did) was bypassable.
 * Returns a dotted-quad string, or null when no v4 is embedded.
 */
function embeddedV4(v6: string): string | null {
  // Trailing dotted-quad: ::ffff:1.2.3.4, ::1.2.3.4, 64:ff9b::1.2.3.4
  const dotted = v6.match(/:((?:\d{1,3}\.){3}\d{1,3})$/);
  if (dotted) return dotted[1];
  // Hex-embedding prefixes (check longer/more-specific prefixes first).
  for (const prefix of ["::ffff:", "64:ff9b::", "::"]) {
    if (!v6.startsWith(prefix)) continue;
    const m = v6.slice(prefix.length).match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (m) {
      const h1 = parseInt(m[1], 16);
      const h2 = parseInt(m[2], 16);
      return [(h1 >> 8) & 255, h1 & 255, (h2 >> 8) & 255, h2 & 255].join(".");
    }
  }
  return null;
}

/** Whether an already-resolved IP literal points at a private/internal target. */
export function isBlockedAddress(ip: string): boolean {
  const v4 = ipv4ToInt(ip);
  if (v4 !== null) return BLOCKED_V4.some((cidr) => inV4Range(v4, cidr));

  // IPv6 — normalise and block loopback, unspecified, link-local (fe80::/10),
  // unique-local (fc00::/7), and any v4-in-v6 form pointing at a blocked v4.
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fe80:") || v6.startsWith("fec0:")) return true;
  if (/^f[cd][0-9a-f][0-9a-f]:/.test(v6)) return true; // fc00::/7
  const v4mapped = embeddedV4(v6);
  if (v4mapped) return isBlockedAddress(v4mapped);
  return false;
}

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/**
 * Validate a user-supplied outbound URL. Throws SsrfError when unsafe.
 *
 * @param raw          the URL string to validate
 * @param allowPrivate when true (local/desktop mode), skip private-range checks
 *                     but still enforce the http(s) scheme allowlist
 * @param schemes      override the allowed URL schemes (e.g. libsql for sync)
 */
export async function assertSafeOutboundUrl(
  raw: string,
  allowPrivate: boolean,
  schemes: Set<string> = ALLOWED_SCHEMES,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("Invalid URL");
  }

  if (!schemes.has(url.protocol)) {
    throw new SsrfError(`Scheme ${url.protocol} is not allowed`);
  }

  if (allowPrivate) return; // desktop mode: the host is the user's own machine

  const host = url.hostname.replace(/^\[|\]$/g, "");

  // Reject literal IPs in blocked ranges directly.
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new SsrfError("Destination address is not allowed");
    return;
  }

  // Obvious localhost aliases that may not resolve via DNS in all environments.
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new SsrfError("Destination host is not allowed");
  }

  // Resolve the hostname and reject if ANY resolved address is internal
  // (defends against DNS records that point at private space).
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new SsrfError("Destination host could not be resolved");
  }
  if (addrs.length === 0) throw new SsrfError("Destination host could not be resolved");
  for (const { address } of addrs) {
    if (isBlockedAddress(address)) throw new SsrfError("Destination resolves to a blocked address");
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const MAX_REDIRECTS = 5;

// A Node `dns.lookup`-shaped resolver, injectable for tests.
type LookupCb = typeof lookupCb;

/**
 * Build a `net.connect`-compatible `lookup` that resolves the hostname and
 * refuses the connection if ANY resolved address is internal. undici threads
 * this option straight into `net.connect`/`tls.connect`, so it runs at the
 * moment of connection — meaning the address we validate is the exact address
 * the socket connects to. This closes the DNS-rebinding TOCTOU window that a
 * validate-then-connect scheme leaves open (the name could re-resolve to an
 * internal IP in between). TLS SNI / cert validation still use the original
 * hostname, so pinning the connect target does not weaken the handshake.
 *
 * Robust to both `lookup` callback contracts: with `{all:true}` it returns the
 * validated address array; otherwise the single `(address, family)` form.
 */
export function makeValidatingLookup(resolver: LookupCb = lookupCb): LookupCb {
  return ((hostname: string, options: any, callback: any) => {
    const cb = typeof options === "function" ? options : callback;
    const wantAll = typeof options === "object" && options?.all === true;
    resolver(hostname, { all: true, verbatim: true }, (err, addresses: any) => {
      if (err) return cb(err);
      const list = Array.isArray(addresses)
        ? addresses
        : [{ address: addresses as unknown as string, family: 4 }];
      if (list.length === 0) return cb(new SsrfError("Destination host could not be resolved"));
      for (const a of list) {
        if (isBlockedAddress(a.address)) {
          return cb(new SsrfError("Destination resolves to a blocked address"));
        }
      }
      if (wantAll) return cb(null, list);
      const first = list[0];
      cb(null, first.address, first.family);
    });
  }) as unknown as LookupCb;
}

// Shared dispatcher for cloud/enforced mode: every fresh connection re-resolves
// through the validating lookup, so pooled keep-alive connections (already to a
// validated IP) are reused safely while any new connection is re-checked.
const pinnedDispatcher = new Agent({ connect: { lookup: makeValidatingLookup() } });

/**
 * SSRF-safe fetch. Three layers of defense:
 *   1. Validates the destination URL up front (scheme + pre-resolution).
 *   2. Follows redirects MANUALLY, re-validating each hop's Location — so a
 *      public URL that 302s to an internal/metadata host (which stock `fetch`
 *      follows blindly, leaking forwarded credentials) is refused.
 *   3. In cloud/enforced mode connects through an IP-pinning dispatcher whose
 *      connect-time lookup re-validates the resolved address, closing the
 *      DNS-rebinding TOCTOU between validation and connection.
 *
 * Desktop mode (`allowPrivate`) skips pinning: the host is the user's own
 * machine and may legitimately be localhost / a LAN address.
 *
 * @param fetchImpl injectable for tests; defaults to undici fetch (so the
 *                  dispatcher option is honored — it must share undici's instance).
 */
export async function safeFetch(
  url: string,
  init: RequestInit,
  allowPrivate: boolean,
  schemes: Set<string> = ALLOWED_SCHEMES,
  fetchImpl: FetchLike = undiciFetch as unknown as FetchLike,
): Promise<Response> {
  let current = url;
  for (let hop = 0; ; hop++) {
    await assertSafeOutboundUrl(current, allowPrivate, schemes);
    const reqInit = { ...init, redirect: "manual" as const };
    if (!allowPrivate) (reqInit as { dispatcher?: unknown }).dispatcher = pinnedDispatcher;
    const res = await fetchImpl(current, reqInit);
    const isRedirect = res.status >= 300 && res.status < 400 && res.headers.get("location");
    if (!isRedirect) return res;
    if (hop >= MAX_REDIRECTS) throw new SsrfError("Too many redirects");
    current = new URL(res.headers.get("location")!, current).toString();
  }
}
