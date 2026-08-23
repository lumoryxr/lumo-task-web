/**
 * Readiness probe — bounded DB check.
 *
 * `/ready` exists so a load balancer can stop routing to an instance whose
 * database is gone. That only works if it ANSWERS. An unbounded `SELECT 1`
 * against an unreachable Turso doesn't fail — it hangs, until the platform's own
 * request timeout kills it. The balancer then sees a timeout rather than a clean
 * 503, which is a weaker, slower signal: it keeps sending real user traffic to a
 * dead instance while it waits.
 *
 * So the probe races the query against a deadline and reports "down" if the
 * deadline wins.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkReadiness, READINESS_TIMEOUT_MS } from "../../lib/readiness.js";

describe("Readiness · bounded database probe", () => {
  test("reports up when the probe resolves", async () => {
    const result = await checkReadiness(async () => undefined, 50);
    assert.deepEqual(result, { ok: true, db: "up" });
  });

  test("reports down when the probe rejects", async () => {
    const result = await checkReadiness(async () => {
      throw new Error("connection refused");
    }, 50);
    assert.equal(result.ok, false);
    assert.equal(result.db, "down");
    assert.match(result.error ?? "", /connection refused/);
  });

  test("reports down when the probe outlives the deadline, without waiting for it", async () => {
    // The hang case: a query that never settles must not hold the probe open.
    const started = Date.now();
    const result = await checkReadiness(() => new Promise(() => {}), 40);
    const elapsed = Date.now() - started;

    assert.equal(result.ok, false);
    assert.equal(result.db, "down");
    assert.match(result.error ?? "", /timed out/i);
    assert.ok(
      elapsed < 1000,
      `probe should give up at the deadline, but took ${elapsed}ms — it is still unbounded`,
    );
  });

  test("the deadline timer does not outlive the probe", async () => {
    // A timer left pending after the probe settles would keep the event loop
    // alive and stall a graceful shutdown. It must be cleared on BOTH paths —
    // the fast path (query won) and the timeout path (deadline won).
    const timers = () => process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;

    const before = timers();
    await checkReadiness(async () => undefined, 30_000); // fast path, long deadline
    assert.equal(timers(), before, "a resolved probe left its deadline timer pending");

    await checkReadiness(() => new Promise(() => {}), 20); // timeout path
    assert.equal(timers(), before, "a timed-out probe left a timer pending");
  });

  test("the default deadline is short enough to beat a platform request timeout", () => {
    assert.ok(
      READINESS_TIMEOUT_MS > 0 && READINESS_TIMEOUT_MS <= 5000,
      `READINESS_TIMEOUT_MS is ${READINESS_TIMEOUT_MS}ms — a probe deadline must be well ` +
        `under the platform's request timeout to be the thing that fires first`,
    );
  });
});
