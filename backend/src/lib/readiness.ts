/**
 * Readiness probe with a bounded database check.
 *
 * `/ready` answers "can this instance actually serve?" so a load balancer can
 * drain it. That is only useful if the endpoint RESPONDS when the answer is no.
 *
 * An unbounded `SELECT 1` against an unreachable database does not fail — it
 * hangs, until the platform's own request timeout kills the connection. The
 * balancer then observes a timeout instead of a clean 503: a slower, weaker
 * signal that keeps real user traffic pointed at a dead instance for longer.
 *
 * So the query is raced against a deadline, and losing the race is reported as
 * "down" — the same answer a refused connection gives, arrived at promptly.
 */

/**
 * How long the probe waits for the database before calling it down.
 *
 * Deliberately short. This must fire well before the platform's request timeout
 * (tens of seconds), because the whole point is to be the thing that answers.
 * A healthy `SELECT 1` — even cross-region to Turso — completes in low tens of
 * milliseconds; a database that needs more than two seconds is not one this
 * instance should be taking traffic against.
 */
export const READINESS_TIMEOUT_MS = 2000;

export interface ReadinessResult {
  ok: boolean;
  db: "up" | "down";
  /** Why the check failed. Present only when `ok` is false. */
  error?: string;
}

/**
 * Run `probe` under a deadline and translate the outcome into a readiness answer.
 *
 * The losing side of the race is abandoned rather than awaited: a hung query
 * keeps running inside the driver, but it no longer holds the HTTP response
 * open.
 *
 * The deadline timer is cleared in `finally`, so it never outlives the probe and
 * cannot delay a graceful shutdown by more than the (short) timeout of a request
 * genuinely in flight. It is deliberately NOT `unref`'d: an unref'd deadline
 * lets the event loop drain while the probe is still pending, so in an otherwise
 * idle process the timeout would never fire and the hang case — the one this
 * exists for — would never be reported.
 */
export async function checkReadiness(
  probe: () => Promise<unknown>,
  timeoutMs: number = READINESS_TIMEOUT_MS,
): Promise<ReadinessResult> {
  let timer: NodeJS.Timeout | undefined;

  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  try {
    const outcome = await Promise.race([probe().then(() => "ok" as const), deadline]);
    if (outcome === "timeout") {
      return {
        ok: false,
        db: "down",
        error: `database probe timed out after ${timeoutMs}ms`,
      };
    }
    return { ok: true, db: "up" };
  } catch (err) {
    return { ok: false, db: "down", error: (err as Error)?.message ?? String(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
