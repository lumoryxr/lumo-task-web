/**
 * Offline write queue (ADR-0003 Phase 4b, web).
 *
 * When a mutating request fails because the device is offline, it is appended
 * here (persisted per user in localStorage) and the UI keeps its optimistic
 * state. On reconnect the queue is flushed in FIFO order, each replayed with its
 * Idempotency-Key so a create/update that actually reached the server (but whose
 * response was lost) is not duplicated. Combined with client-generated ids
 * (Phase 4b backend), an offline-created entity has a stable id throughout.
 *
 * The flush executor is injected so the core is pure and unit-testable; the
 * production executor wraps `sendWrite` from the api client.
 */
import { sendWrite } from "@/api/client";

/** Generate a client-side id with the server's prefix convention (offline-first). */
export function clientId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rand.slice(0, 20)}`;
}

/** True when a thrown request error is a connectivity/offline failure (vs a 4xx). */
export function isOfflineError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /无法连接|超时|timed?\s*out|failed to fetch|networkerror|load failed/i.test(msg);
}

export interface QueuedWrite {
  key: string; // Idempotency-Key (also the dedupe key)
  method: "POST" | "PATCH" | "DELETE";
  path: string; // e.g. "/tasks" or "/tasks/<id>"
  body?: unknown;
  ts: number;
}

/** Result of attempting to replay one item. */
export type ReplayOutcome = "ok" | "retry" | "drop";

export type Executor = (w: QueuedWrite) => Promise<ReplayOutcome>;

const PREFIX = "lumo.writeq.";
const key = (userId: string) => PREFIX + userId;

export function list(userId: string): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(key(userId));
    const arr = raw ? (JSON.parse(raw) as QueuedWrite[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(userId: string, items: QueuedWrite[]): void {
  localStorage.setItem(key(userId), JSON.stringify(items));
}

export function enqueue(userId: string, w: QueuedWrite): void {
  const items = list(userId);
  // Dedupe by idempotency key (a double-enqueue of the same logical write).
  if (items.some((it) => it.key === w.key)) return;
  items.push(w);
  save(userId, items);
}

export function pendingCount(userId: string): number {
  return list(userId).length;
}

/**
 * Flush the queue in FIFO order. Stops at the first item that needs to retry
 * (network still down) so ordering is preserved; drops items the server
 * permanently rejected. Returns counts.
 */
export async function flush(
  userId: string,
  exec: Executor,
): Promise<{ flushed: number; dropped: number; remaining: number }> {
  let flushed = 0;
  let dropped = 0;
  // Re-read the queue each step so concurrent enqueues are seen.
  for (;;) {
    const items = list(userId);
    if (items.length === 0) break;
    const head = items[0];
    let outcome: ReplayOutcome;
    try {
      outcome = await exec(head);
    } catch {
      // Executor threw (e.g. network error) → treat as retryable.
      outcome = "retry";
    }
    if (outcome === "retry") break; // keep head + rest; try again later
    // ok or drop → remove the head (re-read in case the list changed).
    const after = list(userId).filter((it) => it.key !== head.key);
    save(userId, after);
    if (outcome === "ok") flushed++;
    else dropped++;
  }
  return { flushed, dropped, remaining: pendingCount(userId) };
}

/** Production executor: replay via sendWrite, classify the HTTP result. */
export const defaultExecutor: Executor = async (w) => {
  let status: number;
  try {
    status = await sendWrite(w.method, w.path, w.body, w.key);
  } catch {
    return "retry"; // no response → still offline
  }
  if (status >= 200 && status < 300) return "ok";
  // Transient server/overload → retry; 408/429 too.
  if (status === 408 || status === 429 || status >= 500) return "retry";
  // 4xx (validation/conflict/404/409): the server will never accept it → drop,
  // so a poison item can't wedge the queue forever.
  return "drop";
};

export interface FlusherHandle {
  flushNow: () => void;
  stop: () => void;
}

/**
 * Start flushing: now, whenever the browser comes back online, and on an
 * interval. Returns a stop handle. Errors are swallowed (best-effort).
 */
export function startFlusher(userId: string, opts: { intervalMs?: number; exec?: Executor } = {}): FlusherHandle {
  const intervalMs = opts.intervalMs ?? 30_000;
  const exec = opts.exec ?? defaultExecutor;
  let stopped = false;
  let inFlight = false;

  const flushNow = () => {
    if (stopped || inFlight) return;
    if (pendingCount(userId) === 0) return;
    inFlight = true;
    flush(userId, exec).catch(() => {}).finally(() => { inFlight = false; });
  };

  const onOnline = () => flushNow();
  if (typeof window !== "undefined") window.addEventListener("online", onOnline);
  const timer = setInterval(flushNow, intervalMs);
  flushNow();

  return {
    flushNow,
    stop() {
      stopped = true;
      clearInterval(timer);
      if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
    },
  };
}
