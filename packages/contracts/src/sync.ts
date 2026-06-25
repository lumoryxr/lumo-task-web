import { z } from "zod";

/**
 * Incremental sync (ADR-0003) — protocol for the delta-pull endpoint
 * `GET /v1/sync`. The cursor is a server-issued monotonic `seq` high-water mark;
 * the server re-scopes every read to the authenticated user, so the cursor
 * carries no tenant authority on its own.
 */
export const SyncDeltaQuerySchema = z.object({
  // 0 / absent = full snapshot; otherwise return only rows with seq > since.
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type SyncDeltaQuery = z.infer<typeof SyncDeltaQuerySchema>;

// A change record is the domain's normal wire object plus sync metadata. Items
// are intentionally loose here (each domain keeps its own wire schema as the
// source of truth); the stable contract is the envelope + the `seq`/`deleted`
// metadata every record carries.
export const SyncChangeRecordSchema = z
  .object({ seq: z.number().int(), deleted: z.boolean() })
  .passthrough();

export const SyncDeltaResponseSchema = z.object({
  // New high-water mark to pass as `since` on the next pull.
  cursor: z.number().int(),
  // True when more changes remain beyond this page (keep paging at `cursor`).
  hasMore: z.boolean(),
  changes: z.object({
    tasks: z.array(SyncChangeRecordSchema),
    completed: z.array(SyncChangeRecordSchema),
    people: z.array(SyncChangeRecordSchema),
    habits: z.array(SyncChangeRecordSchema),
    countdowns: z.array(SyncChangeRecordSchema),
  }),
});
export type SyncDeltaResponse = z.infer<typeof SyncDeltaResponseSchema>;
