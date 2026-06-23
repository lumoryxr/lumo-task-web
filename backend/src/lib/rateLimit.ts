import type { Context, Next, Env } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

type KeyFn<E extends Env> = (c: Context<E>) => string;

/**
 * Creates a Hono middleware that rate-limits by a caller-supplied key.
 * Can be disabled only via LUMO_DISABLE_RATE_LIMIT=1 (used by the test harness);
 * the server refuses to start with that flag set in production (see index.ts).
 */
export function createRateLimiter<E extends Env>(
  limit: number,
  windowMs: number,
  getKey: KeyFn<E>,
) {
  const hits = new Map<string, RateLimitEntry>();

  // Prune expired entries to prevent unbounded Map growth
  function prune(now: number) {
    for (const [k, v] of hits) {
      if (now > v.resetAt) hits.delete(k);
    }
  }

  return async (c: Context<E>, next: Next) => {
    if (process.env.LUMO_DISABLE_RATE_LIMIT === "1") return next();

    const key = getKey(c);
    const now = Date.now();

    // Prune on every 100th request to amortize cost
    if (hits.size % 100 === 0) prune(now);

    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count++;
    if (entry.count > limit) {
      return c.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests. Try again later." } },
        429,
      );
    }
    return next();
  };
}
