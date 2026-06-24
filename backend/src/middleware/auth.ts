import type { Context, Next } from "hono";
import type { Variables } from "../env.js";
import { verifyToken } from "../lib/jwt.js";
import { queryOne } from "../db/client.js";
import { httpError } from "../lib/errors.js";

// In-process cache of revoked JTIs — avoids a DB round-trip on every request
// for tokens that have already been checked. Bounded to 10 000 entries; at that
// point we fall back to DB (still correct, just slower for that one request).
const revokedCache = new Set<string>();
const CACHE_MAX = 10_000;

export async function authMiddleware(c: Context<{ Variables: Variables }>, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return httpError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }
  const token = header.slice(7);
  try {
    const { userId, jti, sv } = await verifyToken(token);

    // Fast-path: already known-revoked
    if (revokedCache.has(jti)) {
      return httpError(c, 401, "UNAUTHORIZED", "Unauthorized");
    }

    // Slow-path: check DB, then populate cache
    const revoked = await queryOne("SELECT 1 FROM revoked_tokens WHERE jti = :jti", { jti });
    if (revoked) {
      if (revokedCache.size < CACHE_MAX) revokedCache.add(jti);
      return httpError(c, 401, "UNAUTHORIZED", "Unauthorized");
    }

    // Session version: reject tokens minted before the user's current version
    // (bumped on password change to invalidate all prior sessions).
    const u = await queryOne<{ session_version: number }>(
      "SELECT session_version FROM users WHERE id = :uid", { uid: userId }
    );
    if (!u || sv < u.session_version) {
      return httpError(c, 401, "UNAUTHORIZED", "Unauthorized");
    }

    c.set("userId", userId);
    c.set("jti", jti);
    await next();
  } catch {
    return httpError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }
}
