/**
 * Sync engine (ADR-0003 Phase 4, web) — multi-device live refresh.
 *
 * The backend exposes an incremental delta (`GET /v1/sync?since=<seq>`) that
 * returns the user's rows changed since a server-issued `seq` high-water mark,
 * including tombstones. This engine polls that delta as a cheap "did anything
 * change on another device?" signal: when changes arrive it advances a stored
 * cursor and tells the caller which domains changed, so the app can refresh just
 * those stores via their existing loaders. It is intentionally ADDITIVE — it
 * does not replace the per-resource fetch path, so it can't corrupt local state;
 * worst case is a redundant refresh.
 *
 * The cursor is namespaced per user in localStorage. On first run for a user we
 * BASELINE the cursor to the server's current head WITHOUT signalling a refresh,
 * so opening the app doesn't trigger a full reload.
 */
import { api } from "@/api/client";

export type SyncDomain = "tasks" | "completed" | "people" | "habits" | "countdowns";

const CURSOR_PREFIX = "lumo.sync.cursor.";
const DEFAULT_INTERVAL_MS = 45_000;
const MAX_PAGES = 50; // safety bound on a single drain

function cursorKey(userId: string): string {
  return CURSOR_PREFIX + userId;
}

export function getCursor(userId: string): number | null {
  const raw = localStorage.getItem(cursorKey(userId));
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function setCursor(userId: string, cursor: number): void {
  localStorage.setItem(cursorKey(userId), String(cursor));
}

/**
 * Drain the delta from the stored cursor to the server head, advancing the
 * cursor. Returns the set of domains that had any change. Pure w.r.t. the app:
 * it only reads/writes the cursor and calls the API.
 */
export async function drainDelta(userId: string): Promise<Set<SyncDomain>> {
  let since = getCursor(userId) ?? 0;
  const changed = new Set<SyncDomain>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await api.syncDelta(since);
    for (const d of ["tasks", "completed", "people", "habits", "countdowns"] as SyncDomain[]) {
      if (res.changes[d] && res.changes[d].length > 0) changed.add(d);
    }
    since = res.cursor;
    setCursor(userId, since);
    if (!res.hasMore) break;
  }
  return changed;
}

export interface SyncEngineHandle {
  /** Force an immediate poll (e.g. on window focus). */
  poll: () => Promise<void>;
  stop: () => void;
}

/**
 * Start polling. On the first run for a user with no stored cursor, the cursor
 * is baselined to the current head and `onChanges` is NOT called (no spurious
 * reload on app open). Thereafter, each poll that finds changed domains calls
 * `onChanges(domains)`.
 */
export function startSyncEngine(
  userId: string,
  onChanges: (domains: Set<SyncDomain>) => void,
  opts: { intervalMs?: number } = {},
): SyncEngineHandle {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  let stopped = false;
  let inFlight = false;

  async function poll(): Promise<void> {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const hadCursor = getCursor(userId) != null;
      const changed = await drainDelta(userId);
      // Don't signal on the very first baseline drain (cursor was absent): the
      // app already loaded its data, so a refresh would be redundant.
      if (hadCursor && changed.size > 0) onChanges(changed);
    } catch {
      // Network hiccup — swallow; the next tick retries. (Read-only signal.)
    } finally {
      inFlight = false;
    }
  }

  const timer = setInterval(poll, intervalMs);
  const onFocus = () => { void poll(); };
  if (typeof window !== "undefined") window.addEventListener("focus", onFocus);

  // Kick off an initial baseline/poll.
  void poll();

  return {
    poll,
    stop() {
      stopped = true;
      clearInterval(timer);
      if (typeof window !== "undefined") window.removeEventListener("focus", onFocus);
    },
  };
}
