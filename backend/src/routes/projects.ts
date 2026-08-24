import { Hono } from "hono";
import { validate } from "../lib/validate.js";
import {
  ProjectCreateBodySchema,
  ProjectUpdateBodySchema,
  ProjectMigrateBodySchema,
  type Goal,
} from "@lumo/contracts";
import { z } from "zod";
import { nanoid } from "nanoid";
import { query, queryOne, execute, batch } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { hlcNow } from "../lib/hlc.js";
import { decodeCursor, encodeCursor, type CursorPos } from "../lib/cursor.js";
import type { Variables } from "../env.js";
import type { ProjectRow } from "../db/rows.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

// Projects are content-heavy (up to 1 MB each), so the page size stays modest
// to bound each response; callers page through for the full set.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const IdParam = z.object({ id: z.string().min(1).max(64) });

function parseGoals(raw: string | null): Goal[] {
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

// GET /projects[?limit=&cursor=] → { items, nextCursor }
// Keyset-paginated by (created_at ASC, id ASC). Each project may carry up to
// 1 MB of `content`, so an unbounded array is a real response-size risk on a
// content-heavy account — paginating bounds every single response. The cursor
// is a position only; the query is always re-scoped to the authenticated user.
// Callers that want the whole list page through until nextCursor is null.
app.get("/", async (c) => {
  const userId = c.get("userId");

  const limitRaw = Number(c.req.query("limit"));
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT;

  let after: CursorPos | null = null;
  const cursor = c.req.query("cursor");
  if (cursor) {
    try {
      after = decodeCursor(cursor);
    } catch {
      return httpError(c, 400, "INVALID_CURSOR", "Invalid cursor");
    }
  }

  let sql = "SELECT * FROM projects WHERE user_id = :uid AND deleted_at IS NULL";
  const params: Record<string, string | number> = { uid: userId };
  if (after) {
    params.ca = after.createdAt;
    params.cid = after.id;
    sql += " AND (created_at > :ca OR (created_at = :ca AND id > :cid))";
  }
  // Fetch one extra row to know whether a further page exists.
  params.lim = limit + 1;
  sql += " ORDER BY created_at ASC, id ASC LIMIT :lim";
  const rows = await query<ProjectRow>(sql, params);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? encodeCursor({ createdAt: last.created_at, id: last.id })
    : null;

  return c.json({ items: page.map(rowToProject), nextCursor });
});

// POST /projects/migrate — idempotent bulk import; must be before /:id
app.post("/migrate", validate("json", ProjectMigrateBodySchema), async (c) => {
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
app.post("/", validate("json", ProjectCreateBodySchema), async (c) => {
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
app.patch("/:id", validate("param", IdParam), validate("json", ProjectUpdateBodySchema), async (c) => {
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

  // Existence check drives the 404 (same pattern as PATCH); the writes then run
  // in one atomic batch so we never leave a deleted project with live orphaned
  // tasks on a partial failure.
  const existing = await queryOne<ProjectRow>(
    "SELECT id FROM projects WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: projectId, uid: userId }
  );
  if (!existing) return httpError(c, 404, "NOT_FOUND", "Project not found");

  // Tombstone: both `deleted_at` and `updated_at` ride the LWW order → HLC.
  // Cascade: deleting a project also tombstones its tasks (same HLC tick) so
  // they don't linger as orphaned rows whose project_id points at a gone
  // project — which otherwise leaks as stale project-filter chips. Tenant-
  // scoped; propagates to other devices on sync like any other tombstone.
  const now = hlcNow();
  await batch([
    {
      sql: "UPDATE projects SET deleted_at = :now, updated_at = :now WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
      args: { id: projectId, uid: userId, now },
    },
    {
      sql: "UPDATE tasks SET deleted_at = :now, updated_at = :now WHERE project_id = :id AND user_id = :uid AND deleted_at IS NULL",
      args: { id: projectId, uid: userId, now },
    },
  ]);
  return new Response(null, { status: 204 });
});

export default app;
