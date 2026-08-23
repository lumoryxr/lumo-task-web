import type { Context, Next, Env } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

type KeyFn<E extends Env> = (c: Context<E>) => string;

/**
 * Sweep expired entries at most this often. Time-based rather than keyed off the
 * map's size: a size-based trigger only fires while the map is growing, so a
 * limiter that reaches a steady population of distinct keys stops reclaiming
 * altogether and holds every key it has ever seen. On an endpoint keyed by
 * client IP that footprint is attacker-controlled.
 */
const PRUNE_INTERVAL_MS = 60_000;

/**
 * Creates a Hono middleware that rate-limits by a caller-supplied key.
 *
 * Every response carries the caller's budget (`RateLimit-Limit`,
 * `RateLimit-Remaining`, `RateLimit-Reset`), and a rejected one carries
 * `Retry-After`. Without that, a client can only guess when to come back, and
 * ours guessed badly: `web-app/src/api/client.ts` retries a 429 on a fixed
 * 300ms/600ms backoff, so against a 60-second window it spent both retries
 * inside a second — both certain to fail — and surfaced an error the correct
 * backoff would have avoided.
 *
 * Scope: state is per-process and in memory. Behind more than one instance the
 * effective limit is multiplied by the instance count, which is acceptable for
 * the current single-instance deployment but is the thing to revisit (a shared
 * store) before horizontal scaling. See docs/ops/overview.md.
 *
 * Can be disabled only via LUMO_DISABLE_RATE_LIMIT=1 (used by the test harness);
 * the server refuses to start with that flag set in production (see index.ts).
 */
export function createRateLimiter<E extends Env>(
  limit: number,
  windowMs: number,
  getKey: KeyFn<E>,
) {
  const hits = new Map<string, RateLimitEntry>();
  let lastPrune = Date.now();

  /** Drop entries whose window has closed. They carry no state worth keeping. */
  function prune(now: number) {
    for (const [k, v] of hits) {
      if (now > v.resetAt) hits.delete(k);
    }
    lastPrune = now;
  }

  /** Seconds until `resetAt`, rounded UP and floored at 1. */
  function secondsUntil(resetAt: number, now: number): number {
    return Math.max(1, Math.ceil((resetAt - now) / 1000));
  }

  function setBudgetHeaders(c: Context<E>, remaining: number, resetAt: number, now: number) {
    c.header("RateLimit-Limit", String(limit));
    c.header("RateLimit-Remaining", String(Math.max(0, remaining)));
    c.header("RateLimit-Reset", String(secondsUntil(resetAt, now)));
  }

  return async (c: Context<E>, next: Next) => {
    if (process.env.LUMO_DISABLE_RATE_LIMIT === "1") return next();

    const key = getKey(c);
    const now = Date.now();

    if (now - lastPrune >= PRUNE_INTERVAL_MS) prune(now);

    const entry = hits.get(key);

    // No entry, or the previous window has closed → start a fresh one.
    if (!entry || now > entry.resetAt) {
      const resetAt = now + windowMs;
      hits.set(key, { count: 1, resetAt });
      setBudgetHeaders(c, limit - 1, resetAt, now);
      return next();
    }

    entry.count++;

    if (entry.count > limit) {
      setBudgetHeaders(c, 0, entry.resetAt, now);
      // Retry-After is the standard header every HTTP client already understands;
      // rounding up guarantees it never names a deadline that has not passed yet,
      // which would send a well-behaved client straight into another 429.
      c.header("Retry-After", String(secondsUntil(entry.resetAt, now)));
      return c.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests. Try again later." } },
        429,
      );
    }

    setBudgetHeaders(c, limit - entry.count, entry.resetAt, now);
    return next();
  };
}
