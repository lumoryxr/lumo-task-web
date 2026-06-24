/**
 * Trusted-proxy-aware client IP resolution for rate limiting / audit.
 *
 * X-Forwarded-For is a comma-separated chain where each proxy APPENDS the
 * address it received the request from. The left-most entry is therefore fully
 * attacker-controlled (a direct client can send any XFF it likes), so keying a
 * rate limiter on `xff.split(",")[0]` lets an attacker rotate the header and
 * defeat the limit — unlimited login brute force.
 *
 * We instead trust only the entries our own infrastructure appended: with N
 * trusted proxies in front of the app, the real client IP is the entry the
 * outermost trusted proxy inserted, i.e. the N-th from the right. Render (and
 * most single-proxy PaaS) use one hop, so the default is the right-most entry,
 * which the platform sets from the real TCP peer and a client cannot forge.
 *
 * Override with LUMO_TRUSTED_PROXY_HOPS when deploying behind additional proxies.
 */
import type { Context } from "hono";

export function trustedProxyHops(): number {
  const n = parseInt(process.env.LUMO_TRUSTED_PROXY_HOPS ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Minimal shape we need from a request — keeps the helper unit-testable. */
interface HeaderSource {
  header(name: string): string | undefined;
}

export function getClientIp(c: Context | { req: HeaderSource }): string {
  const req = c.req as HeaderSource;
  const xff = req.header("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      const idx = Math.max(0, parts.length - trustedProxyHops());
      return parts[idx];
    }
  }
  const real = req.header("x-real-ip")?.trim();
  return real || "unknown";
}
