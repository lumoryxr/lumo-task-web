/**
 * Sync manifest — the single registry of syncable entities (ADR-0004 Addendum,
 * 2026-06-26; P1a FR1).
 *
 * The generic pull/push engine iterates this array; there is NO per-entity
 * branching anywhere in the sync handlers. Adding a new syncable object is:
 *   1. ensure the table carries the uniform four-tuple
 *      `{ id, user_id, updated_at, deleted_at }` (migration),
 *   2. add a contracts row schema,
 *   3. append one entry here.
 *
 * `columns` is the full set of syncable columns the engine reads on pull and
 * writes on push (the four-tuple plus the entity payload). Server-internal
 * columns (`seq`, which is ADR-0003 legacy machinery slated for removal) are
 * intentionally excluded — they are not part of the cross-device row state.
 *
 * A standards guard (`sync-manifest.standards.test.ts`) introspects each table
 * via `PRAGMA table_info` and FAILS the build if any entity lacks one of the
 * four-tuple columns, so the "generic" guarantee is enforced, not promised.
 */
import { z } from "zod";
import { SyncRowSchema } from "@lumo/contracts";

export interface SyncEntity {
  /** SQLite table name (also the key used in the pull/push entity maps). */
  table: string;
  /** Zod schema each row is validated against on push (and on pull, if practical). */
  schema: z.ZodType;
  /** Full syncable column list: the four-tuple + the entity payload columns. */
  columns: string[];
}

// The uniform four-tuple every syncable entity must carry. The guard test
// asserts each table actually has these (via PRAGMA table_info).
export const FOUR_TUPLE = ["id", "user_id", "updated_at", "deleted_at"] as const;

/**
 * Per-entity row schema. We keep these lenient/passthrough on purpose: the wire
 * `SyncRowSchema` already enforces the four-tuple, and row payloads originate
 * from our own clients writing rows that this same backend produced. Strictness
 * lives in the create/update route contracts; sync is a row-level transport.
 */
const taskRowSchema = SyncRowSchema;
const personRowSchema = SyncRowSchema;
const completedEntryRowSchema = SyncRowSchema;
const habitRowSchema = SyncRowSchema;
const countdownEventRowSchema = SyncRowSchema;

export const SYNC_MANIFEST: SyncEntity[] = [
  {
    table: "tasks",
    schema: taskRowSchema,
    columns: [
      "id", "user_id", "assignee_ids", "title_en", "title_zh", "desc_en",
      "desc_zh", "quadrant", "today", "due", "duration", "pomos_done",
      "pomos_total", "conviction", "next_step_en", "next_step_zh", "reason_en",
      "reason_zh", "ai_suggest", "completed", "not_now_json", "created_at",
      "updated_at", "recurrence", "week_focus", "subtasks_json",
      "scheduled_start", "deleted_at",
    ],
  },
  {
    table: "people",
    schema: personRowSchema,
    columns: [
      "id", "user_id", "name", "initials", "color", "email", "created_at",
      "updated_at", "deleted_at",
    ],
  },
  {
    table: "completed_entries",
    schema: completedEntryRowSchema,
    columns: [
      "id", "user_id", "task_id", "title_en", "title_zh", "duration",
      "quadrant", "started_at", "completed_at", "updated_at", "deleted_at",
    ],
  },
  {
    table: "habits",
    schema: habitRowSchema,
    columns: [
      "id", "user_id", "title", "emoji", "color", "frequency",
      "frequency_days", "frequency_times", "frequency_interval", "note",
      "created_at", "updated_at", "deleted_at",
    ],
  },
  {
    table: "countdown_events",
    schema: countdownEventRowSchema,
    columns: [
      "id", "user_id", "title", "date", "emoji", "color", "repeat", "note",
      "created_at", "updated_at", "deleted_at",
    ],
  },
];

/** Look up a manifest entity by table name. */
export function manifestEntity(table: string): SyncEntity | undefined {
  return SYNC_MANIFEST.find((e) => e.table === table);
}
