/**
 * Absolute base URL of the web app — used to build the links emailed for
 * password reset / verification and the post-login OAuth redirect back to the
 * SPA.
 *
 * Resolution order:
 *   1. `LUMO_APP_BASE_URL` when set — the authoritative source, REQUIRED for a
 *      split-origin deployment where the SPA is served from a different origin
 *      than the API (e.g. a static frontend + separate API host). Set it to the
 *      public SPA origin, no trailing slash.
 *   2. Otherwise derive the origin from the (reverse-proxied) request itself —
 *      correct for a single-origin deployment where the API serves the SPA
 *      same-origin behind a proxy (the VPS image behind Caddy).
 *
 * Trust model — identical to lib/clientIp. `X-Forwarded-*` is a chain where each
 * proxy APPENDS what it received, so the LEFT-most entry is attacker-controlled.
 * We therefore read the entry our own infrastructure inserted: the N-th from the
 * right, where N = trustedProxyHops(). Picking the left-most instead would let a
 * client send `X-Forwarded-Host: attacker.com` and poison a password-reset link
 * (host-header injection → reset-token theft). Explicit config (1) always wins,
 * so a deployment that cannot trust its inbound headers must set
 * LUMO_APP_BASE_URL rather than rely on this derivation.
 */
import type { Context } from "hono";
import { trustedProxyHops } from "./clientIp.js";

/** Minimal shape we need from a request — keeps the helper unit-testable. */
interface HeaderSource {
  header(name: string): string | undefined;
}

/**
 * Value our own proxy inserted into a possibly-appended `X-Forwarded-*` header:
 * the N-th entry from the right (N = trusted hops), matching lib/clientIp. A
 * single-value header (the common case) resolves to that one value regardless.
 */
function trustedToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  const idx = Math.max(0, parts.length - trustedProxyHops());
  return parts[idx];
}

function isLoopbackHost(host: string): boolean {
  return (
    host === "localhost" || host.startsWith("localhost:") ||
    host === "127.0.0.1" || host.startsWith("127.0.0.1:") ||
    host === "::1" || host.startsWith("[::1]")
  );
}

/**
 * Origin derived from the request's (proxied) proto + host, or `""` when no
 * host can be determined. No trailing slash.
 */
export function requestOrigin(c: Context | { req: HeaderSource }): string {
  const req = c.req as HeaderSource;
  const host = trustedToken(req.header("x-forwarded-host")) || req.header("host")?.trim();
  if (!host) {
    // No host at all → callers get a root-relative URL. That still resolves for
    // the same-origin OAuth redirect, but an email link would be unclickable —
    // warn so an operator isn't left guessing why reset mail looks broken.
    console.warn("[appBaseUrl] no Host/X-Forwarded-Host on request and LUMO_APP_BASE_URL is unset; emitting a relative base URL. Set LUMO_APP_BASE_URL.");
    return "";
  }
  // Default the scheme to https, except for a loopback host (local dev / intranet
  // over plain http) where https would produce an unreachable link.
  const proto = trustedToken(req.header("x-forwarded-proto")) || (isLoopbackHost(host) ? "http" : "https");
  return `${proto}://${host}`.replace(/\/+$/, "");
}

/** Absolute base URL of the web app (see module docs for resolution order). */
export function appBaseUrl(c: Context | { req: HeaderSource }): string {
  const configured = process.env.LUMO_APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return requestOrigin(c);
}
