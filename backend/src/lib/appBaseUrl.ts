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
 *      same-origin behind a proxy (the VPS image behind Caddy). This replaces a
 *      previously hard-coded production URL that sent self-hosters to the wrong
 *      domain after login.
 *
 * The derived host trusts the same proxy the rest of the app already trusts for
 * client IP (see lib/clientIp): a reverse proxy in front sets X-Forwarded-Proto
 * / X-Forwarded-Host. When there is no proxy, the Host header is used. Explicit
 * config (1) always wins, so a deployment that can't trust its inbound headers
 * should set LUMO_APP_BASE_URL.
 */
import type { Context } from "hono";

/** Minimal shape we need from a request — keeps the helper unit-testable. */
interface HeaderSource {
  header(name: string): string | undefined;
}

/** First token of a possibly comma-listed header value (e.g. XFF-style). */
function firstToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const t = value.split(",")[0]?.trim();
  return t || undefined;
}

/**
 * Origin derived from the request's (proxied) proto + host, or `""` when no
 * host can be determined. No trailing slash.
 */
export function requestOrigin(c: Context | { req: HeaderSource }): string {
  const req = c.req as HeaderSource;
  const proto = firstToken(req.header("x-forwarded-proto")) || "https";
  const host = firstToken(req.header("x-forwarded-host")) || req.header("host")?.trim();
  if (!host) return "";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

/** Absolute base URL of the web app (see module docs for resolution order). */
export function appBaseUrl(c: Context | { req: HeaderSource }): string {
  const configured = process.env.LUMO_APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return requestOrigin(c);
}
