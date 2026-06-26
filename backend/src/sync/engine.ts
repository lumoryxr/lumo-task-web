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
  //
  // ACCEPTED EDGE CASE: if a pushed row's `id` collides with ANOTHER user's row,
  // the pusher silently loses their own write (the guard makes it a no-op rather
  // than mutating the foreign row). With nanoid(10/21) the collision probability
  // is astronomically small, so we accept this in favour of the hard isolation
  // guarantee. The isolation guard itself must NEVER be relaxed.
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
 * Validate-all-then-apply: EVERY row in the whole batch is validated against its
 * entity schema FIRST; if any row fails, we throw INVALID_ROW (→ 400) having
 * applied NOTHING. Only after the entire batch validates do we apply the upserts.
 * This means the sole remaining throw source during apply is a true DB fault, so
 * an INVALID_ROW can never leave a partially-applied batch.
 *
 * NOTE on `updated_at`: push PRESERVES each incoming row's `updated_at` (the
 * desktop/client supplies its own HLC and cross-device LWW needs the origin
 * timestamp). The engine never re-stamps it with `hlcNow()` — that is only for
 * server-originated REST writes.
 *
 * The cursor advances ONLY after rows are applied; on a thrown error mid-batch
 * the caller gets the exception and does NOT advance its cursor, so a retry
 * re-fetches safely (AC5).
 */
export async function push(
  userId: string,
  entityMap: Record<string, SyncRow[]>,
): Promise<PushResult> {
  // ── Phase 1: validate the WHOLE batch up front. Nothing is written until
  // every row passes — a single bad row fails the request with 400 and zero
  // side effects.
  const validated: { entity: SyncEntity; row: Record<string, unknown> }[] = [];
  for (const entity of SYNC_MANIFEST) {
    const rows = entityMap[entity.table];
    if (!rows || rows.length === 0) continue;
    for (const row of rows) {
      const parsed = entity.schema.safeParse(row);
      if (!parsed.success) {
        throw Object.assign(new Error("INVALID_ROW"), {
          code: "INVALID_ROW",
          table: entity.table,
          issues: parsed.error.issues,
        });
      }
      validated.push({ entity, row: parsed.data as Record<string, unknown> });
    }
  }

  // ── Phase 2: apply. Each upsert is an independent LWW statement; the only way
  // to throw here is a genuine DB fault, in which case the caller surfaces a 500
  // and its cursor does NOT advance (safe to retry). We can't wrap these in a
  // single batch() because the conditional `ON CONFLICT … WHERE` upsert needs
  // per-statement bound args and the per-row applied/no-op result, which
  // db.batch() does not expose — so isolation/atomicity of a *bad row* is
  // instead guaranteed by the validate-all-up-front in Phase 1.
  let applied = 0;
  let cursor = MIN_HLC;
  for (const { entity, row } of validated) {
    const wrote = await upsertRow(userId, entity, row);
    if (wrote) {
      applied += 1;
      const updatedAt = String(row.updated_at);
      if (updatedAt > cursor) cursor = updatedAt;
    }
  }

  return { applied, cursor };
}
