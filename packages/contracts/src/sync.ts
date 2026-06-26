import { z } from "zod";

/**
 * Sync contract — single source of truth for the generic `/v1/sync/pull` and
 * `/v1/sync/push` protocol (ADR-0004 Addendum, 2026-06-26; P1a).
 *
 * The protocol is GENERIC over entity name: both the pull and push envelopes
 * carry a `{ <table>: Row[] }` map, so adding a new syncable object requires a
 * manifest entry + a per-entity row schema only — no change to these envelopes
 * or to the pull/push handlers.
 *
 * HLC cursor: `updated_at` and the `since`/`cursor` fields are HLC strings (see
 * backend `lib/hlc.ts`) — ISO-8601 UTC with six fractional digits. We validate
 * them as plain non-empty strings here (lexicographic ordering is what matters;
 * the backend owns the strict format).
 */

// ── Shared primitives ─────────────────────────────────────────────────────────

/** An HLC cursor / timestamp string. Kept lenient (non-empty string). */
export const HlcSchema = z.string().min(1);

/**
 * A syncable row as it travels on the wire. Every row carries the uniform
 * four-tuple `{ id, user_id, updated_at, deleted_at }`; the remaining columns
 * are entity-specific and pass through. `user_id` is accepted on the wire but is
 * ALWAYS overwritten server-side with the JWT subject on push — a client cannot
 * use it to write into another user's scope.
 */
export const SyncRowSchema = z
  .object({
    id: z.string().min(1),
    user_id: z.string(),
    updated_at: HlcSchema,
    deleted_at: z.string().nullable().optional(),
  })
  .passthrough();

export type SyncRow = z.infer<typeof SyncRowSchema>;

/** Map of entity table name → array of rows. */
export const SyncEntityMapSchema = z.record(z.string(), z.array(SyncRowSchema));
export type SyncEntityMap = z.infer<typeof SyncEntityMapSchema>;

// ── Pull ──────────────────────────────────────────────────────────────────────

/** `POST /v1/sync/pull` request. `since` defaults to MIN_HLC server-side. */
export const SyncPullRequestSchema = z.object({
  since: HlcSchema.optional(),
});
export type SyncPullRequest = z.infer<typeof SyncPullRequestSchema>;

/**
 * `POST /v1/sync/pull` response. `entities` maps each manifest table to the rows
 * changed since the cursor (tombstones included). `cursor` is the new HLC
 * high-watermark to pass as `since` on the next pull.
 */
export const SyncPullResponseSchema = z.object({
  entities: SyncEntityMapSchema,
  cursor: HlcSchema,
});
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

// ── Push ──────────────────────────────────────────────────────────────────────

/** `POST /v1/sync/push` request. Per-entity arrays of changed/created rows. */
export const SyncPushRequestSchema = z.object({
  entities: SyncEntityMapSchema,
});
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

/**
 * `POST /v1/sync/push` response. `applied` is the number of rows the LWW upsert
 * actually wrote; `cursor` is the max HLC `updated_at` among applied rows (or
 * MIN_HLC if nothing applied).
 */
export const SyncPushResponseSchema = z.object({
  applied: z.number().int().nonnegative(),
  cursor: HlcSchema,
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;
