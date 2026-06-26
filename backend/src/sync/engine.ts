/**
 * Generic, manifest-driven sync engine (ADR-0004 Addendum, 2026-06-26; P1a).
 *
 * `pull` and `push` iterate `SYNC_MANIFEST` with NO per-entity branching. Both
 * are strictly scoped to a single `userId`, which the caller obtains ONLY from
 * the verified JWT (`c.get("userId")`) — never from the request body. This is
 * the single audited chokepoint that enforces cross-user isolation (AC1/AC7).
 *
 * Conflict resolution is row-level Last-Write-Wins keyed on the HLC `updated_at`
 * string: an incoming row applies only if its `updated_at >= stored updated_at`.
 * Tombstones (`deleted_at`) ride the same rule, so a delete with a later HLC is
 * never resurrected by a stale update (AC3/AC4).
 */
import { execute, query } from "../db/client.js";
import { MIN_HLC } from "../lib/hlc.js";
import { SYNC_MANIFEST, type SyncEntity } from "./manifest.js";
import type { SyncRow } from "@lumo/contracts";

export interface PullResult {
  entities: Record<string, SyncRow[]>;
  cursor: string;
}

export interface PushResult {
  applied: number;
  cursor: string;
}

/**
 * Pull every manifest entity's rows owned by `userId` that changed after
 * `since` (HLC string). Tombstoned rows ARE included so peers converge to the
 * deleted state. Returns the new high-watermark cursor (the max `updated_at`
 * seen across all entities, or `since` echoed back if nothing changed).
 */
export async function pull(userId: string, since: string = MIN_HLC): Promise<PullResult> {
  const entities: Record<string, SyncRow[]> = {};
  let cursor = since;

  for (const entity of SYNC_MANIFEST) {
    const cols = entity.columns.join(", ");
    // user_id is BOUND, never interpolated, and is the only identity source.
    const rows = await query<Record<string, unknown>>(
      `SELECT ${cols} FROM ${entity.table}
        WHERE user_id = :uid AND updated_at > :since
        ORDER BY updated_at ASC`,
      { uid: userId, since },
    );

    const out: SyncRow[] = [];
    for (const row of rows) {
      const updatedAt = String(row.updated_at);
      if (updatedAt > cursor) cursor = updatedAt;
      // Validate out through the entity schema when practical; on the off chance
      // a legacy row doesn't conform we still ship it (sync must not drop data).
      const parsed = entity.schema.safeParse(row);
      out.push((parsed.success ? parsed.data : row) as SyncRow);
    }
    entities[entity.table] = out;
  }

  return { entities, cursor };
}

/**
 * Upsert one row under `userId` with LWW. Returns true if the row was written
 * (inserted or updated), false if it was a no-op (older HLC, or a PK collision
 * with a row owned by a DIFFERENT user — see the cross-user guard below).
 */
async function upsertRow(
  userId: string,
  entity: SyncEntity,
  row: Record<string, unknown>,
): Promise<boolean> {
  // Force user_id from the JWT subject — overwrite any client-supplied value so
  // a client can never write into another user's scope.
  const values: Record<string, unknown> = { ...row, user_id: userId };

  // Build the column list / bind params strictly from the manifest, so unknown
  // client-supplied keys are ignored and column order is server-controlled.
  const cols = entity.columns;
  const insertCols = cols.join(", ");
  const insertParams = cols.map((c) => `:${c}`).join(", ");

  // ON CONFLICT update sets every non-key column from the incoming row.
  const updateSet = cols
    .filter((c) => c !== "id" && c !== "user_id")
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");

  const args: Record<string, unknown> = { uid: userId };
  for (const c of cols) {
    // Default any column the client omitted to NULL (libsql requires every named
    // param to be bound). `user_id` is forced; everything else comes from the row.
    args[c] = c === "user_id" ? userId : (values[c] ?? null);
  }

  // The WHERE on the conflict clause enforces BOTH:
  //  - LWW:    excluded.updated_at >= <table>.updated_at   (newer or equal wins)
  //  - Isolation: <table>.user_id = :uid                   (cross-user guard)
  //
  // The cross-user guard is the critical invariant: if a pushed row's `id`
  // collides with a row OWNED BY ANOTHER USER, the WHERE fails, so the conflict
  // update is a NO-OP — the foreign row is never mutated. The INSERT itself
  // can't fire (PK already taken), so the net effect is a rejected write, never
  // a cross-user mutation. A caller therefore cannot overwrite another user's
  // row even by guessing its id.
  const sql =
    `INSERT INTO ${entity.table} (${insertCols}) VALUES (${insertParams})
       ON CONFLICT(id) DO UPDATE SET ${updateSet}
        WHERE ${entity.table}.user_id = :uid
          AND excluded.updated_at >= ${entity.table}.updated_at`;

  const { changes } = await execute(sql, args);
  return changes > 0;
}

/**
 * Apply a batch of per-entity rows under `userId` with LWW. Idempotent: a
 * re-push of the same rows is a no-op (equal HLC re-applies the same values).
 * Returns the count actually written and the max `updated_at` among applied rows.
 *
 * The cursor advances ONLY after rows are applied; on a thrown error mid-batch
 * the caller gets the exception and does NOT advance its cursor, so a retry
 * re-fetches safely (AC5).
 */
export async function push(
  userId: string,
  entityMap: Record<string, SyncRow[]>,
): Promise<PushResult> {
  let applied = 0;
  let cursor = MIN_HLC;

  for (const entity of SYNC_MANIFEST) {
    const rows = entityMap[entity.table];
    if (!rows || rows.length === 0) continue;

    for (const row of rows) {
      // Validate against the entity schema; force user_id happens in upsertRow.
      const parsed = entity.schema.safeParse(row);
      if (!parsed.success) {
        throw Object.assign(new Error("INVALID_ROW"), {
          code: "INVALID_ROW",
          table: entity.table,
          issues: parsed.error.issues,
        });
      }
      const wrote = await upsertRow(userId, entity, parsed.data as Record<string, unknown>);
      if (wrote) {
        applied += 1;
        const updatedAt = String((parsed.data as Record<string, unknown>).updated_at);
        if (updatedAt > cursor) cursor = updatedAt;
      }
    }
  }

  return { applied, cursor };
}
