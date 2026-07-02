import { Hono } from "hono";
import { validate } from "../lib/validate.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { query, queryOne, execute } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { hlcNow } from "../lib/hlc.js";
import type { Variables } from "../env.js";
import type { ProjectRow } from "../db/rows.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

const IdParam = z.object({ id: z.string().min(1).max(64) });

// A single key objective inside a project. Optional target/current/unit turn a
// goal into a numeric KPI (e.g. "Sales" 42/100 万) shown with a progress bar.
const GoalSchema = z.object({
  text: z.string().min(1).max(200),
  done: z.boolean().default(false),
  target: z.number().finite().nonnegative().optional(),
  current: z.number().finite().nonnegative().optional(),
  unit: z.string().max(12).optional(),
});

// `content` is the rich-text document (TipTap JSON / markdown) serialized to a
// string. The 1MB cap is a deliberate V1 tradeoff: it leaves room for a few
// inline-base64 images without letting a row grow unbounded (V2 moves images to
// object storage). `goals` is stored as a JSON array in the goals_json column.
const ProjectBody = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  name: z.string().min(1).max(200),
  category: z.string().max(60).optional().nullable(),
  color: z.enum(["green", "cyan", "amber", "red"]).default("green"),
  emoji: z.string().max(10).optional().nullable(),
  goals: z.array(GoalSchema).max(50).default([]),
  content: z.string().max(1_000_000).optional().nullable(),
  status: z.enum(["active", "archived"]).default("active"),
  pinned: z.boolean().default(false),
});

const ProjectUpdateBody = ProjectBody.partial();

const MigrateBody = z.object({
  projects: z.array(z.object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(200),
    category: z.string().max(60).optional().nullable(),
    color: z.enum(["green", "cyan", "amber", "red"]),
    emoji: z.string().max(10).optional().nullable(),
    goals: z.array(GoalSchema).max(50).default([]),
    content: z.string().max(1_000_000).optional().nullable(),
    status: z.enum(["active", "archived"]).default("active"),
    pinned: z.boolean().default(false),
    createdAt: z.string(),
  })),
});

function parseGoals(raw: string | null): Array<z.infer<typeof GoalSchema>> {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function rowToProject(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? undefined,
    color: row.color,
    emoji: row.emoji ?? undefined,
    goals: parseGoals(row.goals_json),
    content: row.content ?? undefined,
    status: row.status,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /projects
app.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await query<ProjectRow>(
    "SELECT * FROM projects WHERE user_id = :uid AND deleted_at IS NULL ORDER BY created_at ASC",
    { uid: userId }
  );
  return c.json(rows.map(rowToProject));
});

// POST /projects/migrate — idempotent bulk import; must be before /:id
app.post("/migrate", validate("json", MigrateBody), async (c) => {
  const userId = c.get("userId");
  const { projects } = c.req.valid("json");

  for (const p of projects) {
    await execute(
      `INSERT OR IGNORE INTO projects
         (id, user_id, name, category, color, emoji, goals_json, content, status, pinned, created_at, updated_at)
       VALUES
         (:id, :user_id, :name, :category, :color, :emoji, :goals_json, :content, :status, :pinned, :created_at, :updated_at)`,
      {
        id: p.id,
        user_id: userId,
        name: p.name,
        category: p.category ?? null,
        color: p.color,
        emoji: p.emoji ?? null,
        goals_json: JSON.stringify(p.goals ?? []),
        content: p.content ?? null,
        status: p.status,
        pinned: p.pinned ? 1 : 0,
        created_at: p.createdAt,
        // `updated_at` is the LWW/cursor key → canonical HLC, not the client's
        // raw ISO `createdAt` (which would lose sync races). Stamp import time.
        updated_at: hlcNow(),
      }
    );
  }

  return c.json({ ok: true, migrated: projects.length });
});

// POST /projects
app.post("/", validate("json", ProjectBody), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const id = body.id ?? ("prj_" + nanoid(10));
  const now = new Date().toISOString();
  // `updated_at` is the LWW/cursor key for sync → HLC.
  const syncTs = hlcNow();

  await execute(
    `INSERT INTO projects
       (id, user_id, name, category, color, emoji, goals_json, content, status, pinned, created_at, updated_at)
     VALUES
       (:id, :user_id, :name, :category, :color, :emoji, :goals_json, :content, :status, :pinned, :now, :sync_ts)`,
    {
      id,
      user_id: userId,
      name: body.name,
      category: body.category ?? null,
      color: body.color,
      emoji: body.emoji ?? null,
      goals_json: JSON.stringify(body.goals ?? []),
      content: body.content ?? null,
      status: body.status,
      pinned: body.pinned ? 1 : 0,
      now, sync_ts: syncTs,
    }
  );

  const row = await queryOne<ProjectRow>(
    "SELECT * FROM projects WHERE id = :id AND deleted_at IS NULL",
    { id }
  );
  return c.json(rowToProject(row!), 201);
});

// PATCH /projects/:id
app.patch("/:id", validate("param", IdParam), validate("json", ProjectUpdateBody), async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const body = c.req.valid("json");
  // `:now` here only feeds `updated_at` (the LWW/cursor key) → HLC.
  const now = hlcNow();

  const existing = await queryOne<ProjectRow>(
    "SELECT * FROM projects WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: projectId, uid: userId }
  );
  if (!existing) return httpError(c, 404, "NOT_FOUND", "Project not found");

  await execute(
    `UPDATE projects SET
       name = :name, category = :category, color = :color, emoji = :emoji,
       goals_json = :goals_json, content = :content, status = :status, pinned = :pinned, updated_at = :now
     WHERE id = :id AND user_id = :uid`,
    {
      name: body.name ?? existing.name,
      category: "category" in body ? (body.category ?? null) : existing.category,
      color: body.color ?? existing.color,
      emoji: "emoji" in body ? (body.emoji ?? null) : existing.emoji,
      goals_json: body.goals !== undefined ? JSON.stringify(body.goals) : existing.goals_json,
      content: "content" in body ? (body.content ?? null) : existing.content,
      status: body.status ?? existing.status,
      pinned: body.pinned !== undefined ? (body.pinned ? 1 : 0) : existing.pinned,
      now,
      id: projectId,
      uid: userId,
    }
  );

  const row = await queryOne<ProjectRow>(
    "SELECT * FROM projects WHERE id = :id AND deleted_at IS NULL",
    { id: projectId }
  );
  return c.json(rowToProject(row!));
});

// DELETE /projects/:id
app.delete("/:id", validate("param", IdParam), async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  // Tombstone: both `deleted_at` and `updated_at` ride the LWW order → HLC.
  const now = hlcNow();
  const result = await execute(
    "UPDATE projects SET deleted_at = :now, updated_at = :now WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: projectId, uid: userId, now }
  );
  if (result.changes === 0) return httpError(c, 404, "NOT_FOUND", "Project not found");
  // Cascade: deleting a project also tombstones its tasks (same HLC tick) so
  // they don't linger as orphaned rows whose project_id points at a gone
  // project — which otherwise leaks as stale project-filter chips. Tenant-
  // scoped; propagates to other devices on sync like any other tombstone.
  await execute(
    "UPDATE tasks SET deleted_at = :now, updated_at = :now WHERE project_id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: projectId, uid: userId, now }
  );
  return new Response(null, { status: 204 });
});

export default app;
