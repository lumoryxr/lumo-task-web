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

/**
 * Build an absolute URL to a CLIENT-SIDE SPA route. The web app uses HashRouter
 * (so one build works under Electron's file:// origin too), which means every
 * in-app route lives AFTER the '#'. A path-based URL like `${base}/verify-email`
 * is NOT routable: the browser loads index.html, HashRouter sees an empty hash,
 * resolves the default route (→ /today → the auth guard bounces to /login), and
 * the intended page — plus its `?query`, which sits before the '#' where
 * useSearchParams can't see it — is silently lost. Always link to an SPA route
 * through this helper so the '#' is never forgotten. (OAuth already does this.)
 *
 * NOTE: this is only for SPA routes. Links to a backend endpoint (e.g. the
 * verification link `${apiBaseUrl}/v1/auth/verify-email?token=…`) are real HTTP
 * paths and must NOT be hash-prefixed.
 *
 * @param base  absolute origin, no trailing slash (from appBaseUrl)
 * @param route in-app route starting with '/', optionally with a query string,
 *              e.g. "/verify-email?status=success"
 */
export function spaRouteUrl(base: string, route: string): string {
  return `${base}/#${route}`;
}

/**
 * Absolute base URL of the API itself — the origin that emailed verification
 * links point at, so the click lands on the very server that minted the token
 * (always reachable, no cross-origin SPA load / CORS in the critical path). This
 * is why the click reliably completes verification even when the SPA origin
 * (LUMO_APP_BASE_URL) is misconfigured.
 *
 * Resolution order mirrors appBaseUrl:
 *   1. `LUMO_API_BASE_URL` when set — the authoritative public API origin,
 *      REQUIRED only when the request-derived origin can't be trusted or is
 *      wrong (e.g. behind an untrusted proxy). No trailing slash.
 *   2. Otherwise derive from the incoming request origin — correct for both the
 *      single-origin (SPA + API same host) and the split deployment, since the
 *      request that mints the token always arrives at the public API host.
 */
export function apiBaseUrl(c: Context | { req: HeaderSource }): string {
  const configured = process.env.LUMO_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return requestOrigin(c);
}
