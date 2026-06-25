import type { Context } from "hono";
import { queryOne, execute } from "../db/client.js";
import { httpError } from "./errors.js";

const MAX_KEY_LEN = 200;
// A reservation with no stored result is "in flight". If the original request
// died (crash/deploy) after reserving but before storing or releasing, the key
// would otherwise be wedged forever; after this window a retry reclaims it.
const IN_FLIGHT_TTL_MS = 60_000;

/**
 * Make a create handler idempotent under client retries (ADR-0003 Phase 3).
 *
 * If the request carries an `Idempotency-Key` header, the first request reserves
 * the key, runs `build()`, and stores its result; any later request with the
 * same (user, key) replays the stored result instead of creating a duplicate
 * row. Without the header, `build()` runs normally.
 *
 * Reserve-first (INSERT OR IGNORE on the (user_id, key) PK) closes the
 * concurrent-duplicate window: only the request that wins the insert runs
 * `build()`; a racing request with the same key gets the stored result, or a
 * 409 while the first is still in flight.
 *
 * `build()` returns the HTTP status + JSON body the handler would have sent.
 * Errors thrown by `build()` release the reservation so the client can retry.
 *
 * Caveat (closed in Phase 4): `build()` is expected to fail only BEFORE its
 * domain write (e.g. validation). Its sole post-write step is an in-process
 * read-back + map, which is total for clean data — so release-on-error cannot
 * realistically duplicate. The Phase 4 offline-replay consumer will make the
 * domain write + result-store fully transactional for strict exactly-once.
 */
export async function idempotent(
  c: Context,
  build: () => Promise<{ status: number; body: unknown }>,
): Promise<Response> {
  const userId = c.get("userId") as string;
  const key = c.req.header("Idempotency-Key");

  if (key === undefined) {
    const { status, body } = await build();
    return c.json(body as object, status as 200);
  }
  if (key.length === 0 || key.length > MAX_KEY_LEN) {
    return httpError(c, 400, "INVALID_IDEMPOTENCY_KEY", `Idempotency-Key must be 1–${MAX_KEY_LEN} chars`);
  }

  const now = new Date().toISOString();
  const reserved = await execute(
    "INSERT OR IGNORE INTO idempotency_keys (user_id, key, created_at) VALUES (:u, :k, :t)",
    { u: userId, k: key, t: now },
  );

  if (reserved.changes === 0) {
    // Key already exists for this user.
    const prior = await queryOne<{ status: number | null; response: string | null; created_at: string }>(
      "SELECT status, response, created_at FROM idempotency_keys WHERE user_id = :u AND key = :k",
      { u: userId, k: key },
    );
    // Completed → replay the stored result exactly.
    if (prior?.response != null && prior.status != null) {
      return c.json(JSON.parse(prior.response) as object, prior.status as 200);
    }
    // Reserved but no result. If it's been in flight longer than the TTL, the
    // original request likely died (crash/deploy) — reclaim it. Otherwise it's
    // genuinely concurrent → 409.
    const age = prior ? Date.now() - Date.parse(prior.created_at) : Infinity;
    if (age <= IN_FLIGHT_TTL_MS) {
      return httpError(c, 409, "IDEMPOTENCY_IN_PROGRESS", "A request with this Idempotency-Key is already being processed");
    }
    // Reclaim: reset the reservation timestamp, then fall through to run build().
    await execute(
      "UPDATE idempotency_keys SET created_at = :t, status = NULL, response = NULL WHERE user_id = :u AND key = :k",
      { u: userId, k: key, t: now },
    );
  }

  let result: { status: number; body: unknown };
  try {
    result = await build();
  } catch (err) {
    // Release the reservation so a genuine retry isn't permanently wedged.
    await execute("DELETE FROM idempotency_keys WHERE user_id = :u AND key = :k", { u: userId, k: key }).catch(() => {});
    throw err;
  }

  await execute(
    "UPDATE idempotency_keys SET status = :s, response = :r WHERE user_id = :u AND key = :k",
    { s: result.status, r: JSON.stringify(result.body), u: userId, k: key },
  );
  return c.json(result.body as object, result.status as 200);
}
