import { query, execute } from "../db/client.js";

/**
 * Sync garbage collection (ADR-0003 Phase 5).
 *
 * Tombstones (`deleted_at`) and idempotency keys accumulate forever otherwise.
 * GC prunes:
 *   • Tombstoned rows older than the retention window from each syncable table.
 *     Before deleting, it raises `sync_seq.gc_floor` to the max seq among the
 *     pruned rows — so the delta endpoint can tell a client whose cursor is now
 *     below the floor to full-resync (it may have missed these deletes).
 *   • Idempotency keys older than their (short) retention.
 *
 * Pruning a tombstone is a DELETE, which does NOT fire the seq triggers
 * (AFTER INSERT/UPDATE only), so it does not churn seq.
 */
const SYNC_TABLES = ["tasks", "completed_entries", "people", "habits", "countdown_events"];

function daysAgoIso(days: number): string {
  // Caller passes the current time; we avoid Date.now() coupling for testability.
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

export interface GcResult {
  prunedTombstones: number;
  prunedIdempotencyKeys: number;
  gcFloor: number;
}

/**
 * Run a GC pass. `tombstoneRetentionDays` / `idempotencyRetentionDays` default
 * from env (LUMO_TOMBSTONE_RETENTION_DAYS=90, LUMO_IDEMPOTENCY_RETENTION_DAYS=7).
 */
export async function runGc(opts: { tombstoneRetentionDays?: number; idempotencyRetentionDays?: number } = {}): Promise<GcResult> {
  const tombDays = opts.tombstoneRetentionDays ?? Number(process.env.LUMO_TOMBSTONE_RETENTION_DAYS ?? 90);
  const idemDays = opts.idempotencyRetentionDays ?? Number(process.env.LUMO_IDEMPOTENCY_RETENTION_DAYS ?? 7);
  const tombCutoff = daysAgoIso(tombDays);
  const idemCutoff = daysAgoIso(idemDays);

  // Two phases, ORDER MATTERS: raise the floor BEFORE deleting. If we deleted
  // first, a concurrent delta read could fall in the window where a tombstone is
  // already gone but the floor not yet raised — it would miss the delete AND not
  // be told to resync. Raising the floor first means a reader either sees the
  // tombstone still present (fine) or a floor that already covers it (resync).
  let floor = 0;
  for (const table of SYNC_TABLES) {
    const maxRow = await query<{ m: number | null }>(
      `SELECT MAX(seq) AS m FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < :cutoff`,
      { cutoff: tombCutoff },
    );
    const m = maxRow[0]?.m;
    if (m != null) floor = Math.max(floor, Number(m));
  }
  if (floor > 0) {
    await execute("UPDATE sync_seq SET gc_floor = MAX(gc_floor, :f) WHERE id = 1", { f: floor });
  }

  let prunedTombstones = 0;
  for (const table of SYNC_TABLES) {
    const res = await execute(
      `DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < :cutoff`,
      { cutoff: tombCutoff },
    );
    prunedTombstones += res.changes;
  }

  const idem = await execute("DELETE FROM idempotency_keys WHERE created_at < :cutoff", { cutoff: idemCutoff });

  const floorRow = await query<{ gc_floor: number }>("SELECT gc_floor FROM sync_seq WHERE id = 1");
  return {
    prunedTombstones,
    prunedIdempotencyKeys: idem.changes,
    gcFloor: Number(floorRow[0]?.gc_floor ?? 0),
  };
}

/** Current GC floor (highest seq whose tombstones have been pruned). */
export async function getGcFloor(): Promise<number> {
  const rows = await query<{ gc_floor: number }>("SELECT gc_floor FROM sync_seq WHERE id = 1");
  return Number(rows[0]?.gc_floor ?? 0);
}

/**
 * Run GC now (best-effort, logged) and again on a daily interval, so a
 * long-lived process keeps pruning instead of only at startup. Returns a stop
 * function. Errors are swallowed (GC must never take the process down).
 */
export function startGcScheduler(intervalMs = 24 * 60 * 60 * 1000): () => void {
  const tick = () => {
    runGc()
      .then((r) => console.log(`[gc] pruned ${r.prunedTombstones} tombstones, ${r.prunedIdempotencyKeys} idempotency keys; floor=${r.gcFloor}`))
      .catch((e) => console.error("[gc] error:", e instanceof Error ? e.message : e));
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
