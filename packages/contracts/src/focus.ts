import { z } from "zod";
import { LocalizedStringSchema } from "./primitives.js";

/**
 * Focus + Completed contract — single source of truth for the
 * `/v1/focus/sessions` and `/v1/completed` protocols.
 *
 * The two live together because they write and read the same table: recording a
 * focus session appends a completed-history entry, and `/v1/completed` is the
 * read side of that history (plus task completions).
 */

/**
 * ISO-8601 instant, with optional seconds / milliseconds / offset. Deliberately
 * looser than a strict `datetime()` so a client that omits seconds or sends a
 * local offset is accepted, while free-form junk is not.
 */
export const IsoInstantSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?$/);

/**
 * Upper bound on a focus session, in minutes: [1, 1440] (= 24h) — the same
 * ceiling the contract puts on `tasks.duration`. An unbounded value silently
 * poisons Stats (a single overflow-shaped session dwarfs every real total) and
 * has no legitimate meaning, so it is rejected at the request boundary with a
 * clean 400 rather than stored.
 */
export const MAX_SESSION_MINUTES = 1440;

// ── POST /v1/focus/sessions ───────────────────────────────────────────────────

export const FocusSessionBodySchema = z.object({
  /** The task this pomodoro was spent on, or null for an untracked session. */
  task_id: z.string().nullable().optional(),
  duration: z.number().int().min(1).max(MAX_SESSION_MINUTES),
  started_at: IsoInstantSchema.optional(),
});

export const FocusSessionResponseSchema = z.object({
  ok: z.literal(true),
  entry_id: z.string(),
});

// ── /v1/completed ─────────────────────────────────────────────────────────────

/**
 * One row of completion history — a finished task or a recorded focus session.
 * Read-lenient (`quadrant` as a plain nullable string) to tolerate legacy rows.
 */
export const CompletedEntryWireSchema = z.object({
  id: z.string(),
  task_id: z.string().nullable(),
  title: LocalizedStringSchema,
  duration: z.number(),
  quadrant: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string(),
  project_id: z.string().nullable(),
  tags: z.array(z.string()),
});

/**
 * GET /v1/completed has two shapes, selected by the query string:
 *   • `?date=YYYY-MM-DD` → a bare array (one day, inherently bounded)
 *   • no `date`         → `{ items, nextCursor }` (full history, paginated)
 */
export const CompletedListResponseSchema = z.object({
  items: z.array(CompletedEntryWireSchema),
  nextCursor: z.string().nullable(),
});

export const CompletedDayResponseSchema = z.array(CompletedEntryWireSchema);

/** POST /v1/completed/:id/reopen — restores the entry's task to the active list. */
export const ReopenResponseSchema = z.object({
  ok: z.literal(true),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type FocusSessionInput = z.input<typeof FocusSessionBodySchema>;
export type FocusSessionResponse = z.infer<typeof FocusSessionResponseSchema>;
export type CompletedEntryWire = z.infer<typeof CompletedEntryWireSchema>;
export type CompletedListResponse = z.infer<typeof CompletedListResponseSchema>;
