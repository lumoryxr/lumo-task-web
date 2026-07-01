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

// ── Project template payload (#211 V2 ⭐3) ─────────────────────────────────────
//
// A project blueprint: the project's authored fields plus a set of task
// scaffolds. Instantiating rebuilds a fresh project (goals reset to not-done)
// and one new task per scaffold, filed under it — reusing the same task
// blueprint shape as single-task templates so the two stay aligned. Mirrors the
// backend ProjectBody validation (name/category/color/emoji/goals/content).
export const ProjectTemplateGoalSchema = z.object({
  text: z.string().min(1).max(200),
});

export const ProjectTemplatePayloadSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(60).nullable().optional(),
  color: z.enum(["green", "cyan", "amber", "red"]).default("green"),
  emoji: z.string().max(10).nullable().optional(),
  // Goals carry text only — completion is reset on instantiate, just like task
  // progress is dropped from a task template.
  goals: z.array(ProjectTemplateGoalSchema).max(50).default([]),
  content: z.string().max(1_000_000).nullable().optional(),
  tasks: z.array(TemplatePayloadSchema).max(100).default([]),
});

// ── Request bodies ────────────────────────────────────────────────────────────

// A union (not a single object with an optional kind) so each kind's payload is
// validated against the right schema. The task variant defaults kind to "task",
// preserving backward compatibility with clients that omit it entirely.
const TaskTemplateCreateSchema = z.object({
  // Optional client-generated id (offline-first), server-generated when absent.
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  name: z.string().min(1).max(200),
  kind: z.literal("task").default("task"),
  payload: TemplatePayloadSchema,
});

const ProjectTemplateCreateSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  name: z.string().min(1).max(200),
  kind: z.literal("project"),
  payload: ProjectTemplatePayloadSchema,
});

export const TemplateCreateBodySchema = z.union([
  TaskTemplateCreateSchema,
  ProjectTemplateCreateSchema,
]);

// Update is a rename or payload replace; payload (when present) is validated per
// kind by the route. The common path — renaming a library entry — sends name only.
export const TemplateUpdateBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: z.enum(["task", "project"]).optional(),
  payload: z.union([TemplatePayloadSchema, ProjectTemplatePayloadSchema]).optional(),
});

// ── Wire response ─────────────────────────────────────────────────────────────

export const TemplateWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  payload: z.union([TemplatePayloadSchema, ProjectTemplatePayloadSchema]),
  created_at: z.string(),
});

// ── Inferred request/wire types ───────────────────────────────────────────────

export type TemplatePayload = z.infer<typeof TemplatePayloadSchema>;
export type ProjectTemplatePayload = z.infer<typeof ProjectTemplatePayloadSchema>;
export type TemplateKind = "task" | "project";
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

export interface ProjectTemplate {
  id: string;
  name: string;
  kind: "project";
  payload: ProjectTemplatePayload;
  createdAt: string;
}

export type Template = TaskTemplate | ProjectTemplate;
