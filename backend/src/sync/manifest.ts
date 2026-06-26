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
 * writes on push (the four-tuple plus the entity payload) — the complete list
 * of live, cross-device row state for each entity.
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
 * Per-entity row schema. Each EXTENDS the wire `SyncRowSchema` (which enforces
 * the four-tuple) and additionally requires the table's NOT NULL payload columns.
 *
 * Why this matters: if a pushed row omits a NOT NULL column (e.g. a task with no
 * `title_en`, or a person with no `name`), a lenient passthrough schema lets it
 * through and the INSERT then fails the SQLite NOT NULL constraint — surfacing as
 * an opaque 500. By requiring those columns here, a missing required column is
 * caught up front as a clean 400 INVALID_ROW. The engine stays fully generic: it
 * still iterates the manifest and only the `schema` object differs per entity.
 *
 * `.passthrough()` (inherited from SyncRowSchema) keeps every other payload
 * column flowing through untouched, so we don't have to enumerate optional/
 * nullable columns — only the NOT NULL ones that would otherwise cause a 500.
 */

/** Require a set of payload columns to be present & non-null (string content). */
function requiringNotNull(shape: Record<string, z.ZodTypeAny>): z.ZodType {
  return SyncRowSchema.and(z.object(shape).passthrough());
}

// NOT NULL columns per table (mirrors db/migrate.ts CREATE TABLE). `user_id` is
// already required by SyncRowSchema (and is force-overwritten server-side), and
// columns with a SQLite DEFAULT are NOT listed — an omitted one binds to its
// default, never NULL-violating. Only truly NOT-NULL-without-default columns
// (which a missing value would crash on) are required here.
const taskRowSchema = requiringNotNull({
  title_en: z.string(),
});
const personRowSchema = requiringNotNull({
  name: z.string(),
  initials: z.string(),
  color: z.string(),
});
const completedEntryRowSchema = requiringNotNull({
  title_en: z.string(),
});
const habitRowSchema = requiringNotNull({
  title: z.string(),
});
const countdownEventRowSchema = requiringNotNull({
  title: z.string(),
  date: z.string(),
});

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
      "calendar", "created_at", "updated_at", "deleted_at",
    ],
  },
];

/** Look up a manifest entity by table name. */
export function manifestEntity(table: string): SyncEntity | undefined {
  return SYNC_MANIFEST.find((e) => e.table === table);
}
