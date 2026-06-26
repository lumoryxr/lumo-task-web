/**
 * Background sync loop (ADR-0004 Addendum, 2026-06-26; P1b-core FR6).
 *
 * Periodically runs a cycle for every enabled binding. Deliberately MINIMAL and
 * kept OUT of the unit-tested core (`client.ts`) — all the testable logic (the
 * cycle, cursor advancement, single-flight) lives there; this file only owns the
 * timer. It is wired in `index.ts` behind the `LUMO_CLOUD_API_BASE` env flag so
 * the CLOUD deployment itself (which has no bindings) never runs it.
 *
 * Errors per user are swallowed (recorded as last_error inside runSyncCycle) so
 * one user's failure never stops the loop for the others.
 */
import { listEnabledUsers } from "./clientState.js";
import { syncNow } from "./client.js";

let timer: ReturnType<typeof setInterval> | null = null;

/** Run one pass: a cycle per enabled user. Errors are isolated per user. */
export async function runLoopPass(): Promise<void> {
  let users: string[];
  try {
    users = await listEnabledUsers();
  } catch (err) {
    console.error("[sync/loop] could not list enabled users:", err);
    return;
  }
  for (const userId of users) {
    try {
      await syncNow(userId);
    } catch (err) {
      // Already persisted as last_error; log and continue with other users.
      console.error(`[sync/loop] cycle failed for ${userId}:`, err instanceof Error ? err.message : err);
    }
  }
}

/** Start the periodic loop. Idempotent — a second call is a no-op. */
export function startSyncLoop(intervalMs = 30_000): void {
  if (timer) return;
  timer = setInterval(() => {
    void runLoopPass();
  }, intervalMs);
  // Don't keep the process alive solely for the loop.
  if (typeof timer.unref === "function") timer.unref();
}

/** Stop the loop (used by tests / shutdown). */
export function stopSyncLoop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
