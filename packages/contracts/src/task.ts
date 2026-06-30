import { z } from "zod";
import {
  LocalizedStringSchema,
  LongLocalizedStringSchema,
  QuadrantSchema,
  RecurrenceSchema,
  type LocalizedString,
  type LongLocalizedString,
  type Quadrant,
  type TaskRecurrence,
} from "./primitives.js";

/**
 * Task contract — the single source of truth for the `/v1/tasks` protocol.
 *
 * Two shapes live here on purpose and must be reviewed together:
 *   • Request bodies  (`TaskCreateBodySchema`, `TaskUpdateBodySchema`) — what
 *     clients send; validated by the backend at the route boundary.
 *   • Wire response   (`TaskWireSchema`) — exactly what the backend returns
 *     (nullable fields, server timestamps). The backend response handler is
 *     typed against this, and an integration test parses every response with
 *     it so implementation drift fails CI.
 *
 * The frontend additionally re-exports the normalized client view (`Task`,
 * below): the adapter in `web-app/src/api/client.ts` converts the wire shape's
 * `null`s into `undefined`. Keeping the view type here co-located with the wire
 * schema is what prevents the two from drifting across packages.
 */

const SubtaskSchema = z.object({
  id: z.string(),
  title: z.string().max(500),
  completed: z.boolean(),
});

const NotNowItemSchema = z.object({
  id: z.string(),
  reason: LocalizedStringSchema,
});

// A single task label: trimmed, non-empty, capped at 30 chars.
const TagSchema = z.string().trim().min(1).max(30);

// ── Request bodies ────────────────────────────────────────────────────────────

export const TaskCreateBodySchema = z.object({
  // Optional client-generated id (offline-first, ADR-0003 Phase 4): lets a client
  // create an entity offline with a stable id and replay the create idempotently.
  // Server-generated when absent.
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  title: LocalizedStringSchema,
  desc: LongLocalizedStringSchema.optional().nullable(),
  quadrant: QuadrantSchema.default("unclassified"),
  today: z.boolean().default(false),
  week_focus: z.boolean().default(false),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  duration: z.number().int().min(0).max(1440).default(0),
  pomos_total: z.number().int().default(0),
  assignee_ids: z.array(z.string()).default([]),
  conviction: z.number().nullable().optional(),
  next_step: LongLocalizedStringSchema.optional().nullable(),
  recurrence: RecurrenceSchema.default("none"),
  reason: LongLocalizedStringSchema.optional().nullable(),
  ai_suggest: QuadrantSchema.nullable().optional(),
  not_now: z.array(NotNowItemSchema).default([]),
  subtasks: z.array(SubtaskSchema).default([]),
  // Free-form labels, a second organizing axis orthogonal to the quadrant.
  // Trimmed, 1..30 chars each, at most 20 per task to keep rows/sync bounded.
  tags: z.array(TagSchema).max(20).default([]),
  scheduled_start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
    .nullable()
    .optional(),
  // Optional per-task reminder: a local wall-clock datetime at which the client
  // surfaces a notification for this task. Same format as scheduled_start.
  remind_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
    .nullable()
    .optional(),
});

export const TaskUpdateBodySchema = TaskCreateBodySchema.partial();

// ── List query params ─────────────────────────────────────────────────────────
// GET /tasks query string. `q` is an optional case-insensitive keyword that the
// backend matches against task title/description (both locales). Bounded length
// keeps the LIKE scan cheap and rejects abusive input at the route boundary.

export const TaskListQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  // Pagination (keyset). limit is always applied (default 50, max 200) so an
  // unbounded response is impossible. cursor is an opaque keyset token.
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).max(256).optional(),
});

// ── Wire response ─────────────────────────────────────────────────────────────

export const TaskWireSchema = z.object({
  id: z.string(),
  assignee_ids: z.array(z.string()),
  title: LocalizedStringSchema,
  desc: LongLocalizedStringSchema.nullable(),
  quadrant: QuadrantSchema,
  today: z.boolean(),
  week_focus: z.boolean(),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  duration: z.number(),
  pomos_done: z.number(),
  pomos_total: z.number(),
  conviction: z.number().nullable(),
  next_step: LongLocalizedStringSchema.nullable(),
  reason: LongLocalizedStringSchema.nullable(),
  ai_suggest: QuadrantSchema.nullable().catch(null),
  completed: z.boolean(),
  not_now: z.array(NotNowItemSchema),
  recurrence: RecurrenceSchema,
  subtasks: z.array(SubtaskSchema),
  tags: z.array(z.string()).catch([]),
  scheduled_start: z.string().nullable(),
  remind_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// ── Paginated list response ───────────────────────────────────────────────────
// GET /tasks returns a keyset-paginated envelope: a page of items plus the
// cursor to fetch the next page (null on the last page).

export const TaskListResponseSchema = z.object({
  items: z.array(TaskWireSchema),
  nextCursor: z.string().nullable(),
});

// ── Complete-task response ────────────────────────────────────────────────────
// POST /tasks/:id/complete does not return a Task; it acknowledges the write and
// returns the id of the created completed-log entry.

export const TaskCompleteResponseSchema = z.object({
  ok: z.literal(true),
  entry_id: z.string(),
});

// ── Inferred request/wire types ───────────────────────────────────────────────
// Request payload types use z.input so fields with a Zod default (quadrant,
// today, duration, …) are optional in what the client sends. The wire/response
// types use z.infer (defaults already applied by the server).

export type TaskCreateInput = z.input<typeof TaskCreateBodySchema>;
export type TaskUpdateInput = z.input<typeof TaskUpdateBodySchema>;
export type TaskListQuery = z.input<typeof TaskListQuerySchema>;
export type TaskWire = z.infer<typeof TaskWireSchema>;
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;
export type TaskCompleteResponse = z.infer<typeof TaskCompleteResponseSchema>;

// ── Normalized client view (re-exported by web-app/src/types/task.ts) ─────────
// Re-export shared primitive view types so consumers import them from one place.
export type { LocalizedString, Quadrant, TaskRecurrence };

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  /** Person IDs — references People in the people list. Multiple allowed. */
  assignee_ids?: string[];
  title: LocalizedString;
  desc?: LongLocalizedString | null;
  quadrant: Quadrant;
  /** Whether the task is included in today's plan. */
  today: boolean;
  /** Whether the task is a weekly focus item. */
  week_focus: boolean;
  /** Strict ISO date (YYYY-MM-DD) or null when no due date is set. */
  due: string | null;
  /** Estimated minutes. */
  duration: number;
  pomos_done: number;
  pomos_total: number;
  /** Conviction score 0..1, used by the Today recommendation card. */
  conviction?: number;
  /** Lumo's suggested next step. */
  next_step?: LongLocalizedString;
  /** Why Lumo deprioritized other items in favor of this one. */
  reason?: LongLocalizedString;
  /** AI suggested quadrant (used when `quadrant === "unclassified"`). */
  ai_suggest?: Quadrant;
  /** Done-state. */
  completed?: boolean;
  /** Counter-recommendations to be transparent about what's NOT being shown. */
  not_now?: Array<{ id: string; reason: LocalizedString }>;
  /** Recurrence rule — when task is completed, a copy is spawned for the next occurrence. */
  recurrence?: TaskRecurrence;
  /** Inline sub-tasks for breaking a task into smaller steps. */
  subtasks?: Subtask[];
  /** Free-form labels — a second organizing axis orthogonal to the quadrant. */
  tags?: string[];
  /** ISO datetime (YYYY-MM-DDTHH:MM:SS) for a specific time block on the calendar. */
  scheduled_start?: string | null;
  /** ISO datetime (YYYY-MM-DDTHH:MM) at which to surface a reminder notification. */
  remind_at?: string | null;
  /** ISO 8601 server timestamp — when the task was created. Read-only. */
  created_at?: string;
  /** ISO 8601 server timestamp — last write (edit, AI classify, focus). Read-only. Powers Q2 stagnation. */
  updated_at?: string;
}
