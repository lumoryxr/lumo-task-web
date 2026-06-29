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
 * Template contract — single source of truth for the `/v1/templates` protocol
 * (#173, Phase-3 V1: single-task templates).
 *
 * A template is a reusable snapshot of a task's authored fields. "Save as
 * template" captures a task into `payload`; "instantiate" rebuilds a fresh task
 * from `payload` (new ids, progress reset) exactly like single-task Duplicate
 * (#161). Per-instance progress (completion, pomodoros, subtask ids) is NOT part
 * of the payload — it is regenerated on each instantiate, so a template stays a
 * clean blueprint.
 *
 * Storage is intentionally a single JSON `payload` column rather than a wide
 * per-field table: it keeps the entity lightweight and lets V2 project templates
 * (a set of tasks) extend the payload shape without a schema migration.
 */

// The reusable task blueprint. Mirrors the subset of TaskCreateBodySchema that
// is meaningful to reuse. Subtasks are stored as titles only — their ids and
// completion state are regenerated when the template is instantiated.
export const TemplatePayloadSchema = z.object({
  title: LocalizedStringSchema,
  desc: LongLocalizedStringSchema.optional().nullable(),
  quadrant: QuadrantSchema.default("unclassified"),
  today: z.boolean().default(false),
  week_focus: z.boolean().default(false),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  duration: z.number().int().min(0).max(1440).default(0),
  pomos_total: z.number().int().min(0).default(0),
  assignee_ids: z.array(z.string()).default([]),
  recurrence: RecurrenceSchema.default("none"),
  scheduled_start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
    .nullable()
    .optional(),
  remind_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
    .nullable()
    .optional(),
  subtasks: z.array(z.object({ title: z.string().min(1).max(500) })).default([]),
});

// ── Request bodies ────────────────────────────────────────────────────────────

export const TemplateCreateBodySchema = z.object({
  // Optional client-generated id (offline-first), server-generated when absent.
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  name: z.string().min(1).max(200),
  // V1 only supports single-task templates; the field is here so V2 (project
  // templates) is an additive change, not a breaking one.
  kind: z.literal("task").default("task"),
  payload: TemplatePayloadSchema,
});

export const TemplateUpdateBodySchema = TemplateCreateBodySchema.partial();

// ── Wire response ─────────────────────────────────────────────────────────────

export const TemplateWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  payload: TemplatePayloadSchema,
  created_at: z.string(),
});

// ── Inferred request/wire types ───────────────────────────────────────────────

export type TemplatePayload = z.infer<typeof TemplatePayloadSchema>;
export type TemplateCreateInput = z.input<typeof TemplateCreateBodySchema>;
export type TemplateUpdateInput = z.input<typeof TemplateUpdateBodySchema>;
export type TemplateWire = z.infer<typeof TemplateWireSchema>;

// ── Normalized client view (re-exported by web-app/src/types) ─────────────────
export type { LocalizedString, LongLocalizedString, Quadrant, TaskRecurrence };

export interface TaskTemplate {
  id: string;
  name: string;
  kind: "task";
  payload: TemplatePayload;
  createdAt: string;
}
