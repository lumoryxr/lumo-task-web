import { z } from "zod";

/**
 * Project contract — single source of truth for the `/v1/projects` protocol.
 *
 * A project is a rich-text workspace with a list of goals/KRs. Previously these
 * shapes lived inline in `backend/src/routes/projects.ts`, so the goal/KPI
 * grammar was invisible to both the frontend and the published API docs.
 */

/**
 * A single key objective inside a project. Optional target/current/unit turn a
 * goal into a numeric KPI (e.g. "Sales" 42/100 万) shown with a progress bar.
 * `confidence` is the OKR-style check-in health signal. All KPI/OKR fields are
 * optional so plain checkbox goals — and every pre-existing stored goal — keep
 * validating unchanged (no migration required).
 */
export const GoalSchema = z.object({
  text: z.string().min(1).max(200),
  done: z.boolean().default(false),
  target: z.number().finite().nonnegative().optional(),
  current: z.number().finite().nonnegative().optional(),
  /**
   * The KR baseline (e.g. a metric already at 20 on the way to 100); progress is
   * measured start→target, not 0→target.
   */
  start: z.number().finite().nonnegative().optional(),
  unit: z.string().max(12).optional(),
  confidence: z.enum(["on_track", "at_risk", "off_track"]).optional(),
});

export const ProjectColorSchema = z.enum(["green", "cyan", "amber", "red"]);
export const ProjectStatusSchema = z.enum(["active", "archived"]);

/** Max goals per project — bounds the goals_json column and the UI list. */
export const MAX_GOALS_PER_PROJECT = 50;

/**
 * `content` is the rich-text document (TipTap JSON / markdown) serialized to a
 * string. The 1 MB cap is a deliberate V1 tradeoff: it leaves room for a few
 * inline-base64 images without letting a row grow unbounded (V2 moves images to
 * object storage).
 */
export const MAX_PROJECT_CONTENT_BYTES = 1_000_000;

// ── Request bodies ────────────────────────────────────────────────────────────

export const ProjectCreateBodySchema = z.object({
  /** Optional client-generated id (offline-first, ADR-0003 Phase 4). */
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  name: z.string().min(1).max(200),
  category: z.string().max(60).optional().nullable(),
  color: ProjectColorSchema.default("green"),
  emoji: z.string().max(10).optional().nullable(),
  goals: z.array(GoalSchema).max(MAX_GOALS_PER_PROJECT).default([]),
  content: z.string().max(MAX_PROJECT_CONTENT_BYTES).optional().nullable(),
  status: ProjectStatusSchema.default("active"),
  pinned: z.boolean().default(false),
});

export const ProjectUpdateBodySchema = ProjectCreateBodySchema.partial();

/**
 * Bulk-import array is bounded so a single /migrate call can't force unbounded
 * memory/CPU. Each project may carry up to 1 MB of `content`, so an unbounded
 * array is the dominant memory vector here. The cap sits well above any
 * realistic export (a heavy user has at most low-hundreds of projects), so no
 * genuine migration is rejected — only pathological payloads are.
 */
export const MIGRATE_MAX_PROJECTS = 10_000;

export const ProjectMigrateBodySchema = z.object({
  projects: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(200),
        category: z.string().max(60).optional().nullable(),
        color: ProjectColorSchema,
        emoji: z.string().max(10).optional().nullable(),
        goals: z.array(GoalSchema).max(MAX_GOALS_PER_PROJECT).default([]),
        content: z.string().max(MAX_PROJECT_CONTENT_BYTES).optional().nullable(),
        status: ProjectStatusSchema.default("active"),
        pinned: z.boolean().default(false),
        createdAt: z.string(),
      }),
    )
    .max(MIGRATE_MAX_PROJECTS),
});

// ── Wire responses ────────────────────────────────────────────────────────────
// Lenient on read (plain strings for color/status) to tolerate legacy rows;
// strict on write above.

export const ProjectWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional(),
  color: z.string(),
  emoji: z.string().optional(),
  goals: z.array(GoalSchema),
  content: z.string().optional(),
  status: z.string(),
  pinned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** GET /v1/projects — keyset-paginated by (created_at ASC, id ASC). */
export const ProjectListResponseSchema = z.object({
  items: z.array(ProjectWireSchema),
  nextCursor: z.string().nullable(),
});

export const ProjectMigrateResponseSchema = z.object({
  ok: z.literal(true),
  migrated: z.number(),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type Goal = z.infer<typeof GoalSchema>;
export type ProjectColor = z.infer<typeof ProjectColorSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type ProjectCreateInput = z.input<typeof ProjectCreateBodySchema>;
export type ProjectUpdateInput = z.input<typeof ProjectUpdateBodySchema>;
export type ProjectMigrateInput = z.input<typeof ProjectMigrateBodySchema>;
export type ProjectWire = z.infer<typeof ProjectWireSchema>;
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;
