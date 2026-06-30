import { Hono } from "hono";
import { query, queryOne, execute, batch } from "../db/client.js";
import type { InStatement } from "@libsql/client";
import { authMiddleware } from "../middleware/auth.js";
import type { Variables } from "../env.js";
import { httpError } from "../lib/errors.js";
import { hlcNow } from "../lib/hlc.js";
import { decodeCursor, encodeCursor, type CursorPos } from "../lib/cursor.js";
import type { CompletedEntryRow } from "../db/rows.js";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

export function rowToEntry(row: CompletedEntryRow) {
  return {
    id: row.id,
    task_id: row.task_id ?? null,
    title: { en: row.title_en, ...(row.title_zh ? { zh: row.title_zh } : {}) },
    duration: row.duration,
    quadrant: row.quadrant ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at,
    project_id: row.project_id ?? null,
  };
}

// GET /completed?date=YYYY-MM-DD  → array (one day, bounded)
// GET /completed[?limit=&cursor=] → { items, nextCursor } (full history, paginated)
app.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const date = c.req.query("date");
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return httpError(c, 400, "INVALID_DATE", "date must be in YYYY-MM-DD format");
  }

  // A single local day's entries are inherently bounded → return the full array
  // (unchanged contract; used by the per-day view).
  if (date) {
    const rows = await query<CompletedEntryRow>(`
      SELECT * FROM completed_entries
      WHERE user_id = :uid AND deleted_at IS NULL AND DATE(completed_at, 'localtime') = :date
      ORDER BY completed_at ASC
    `, { uid: userId, date });
    return c.json(rows.map(rowToEntry));
  }

  // No date filter: the full history is unbounded, so it is keyset-paginated by
  // (completed_at DESC, id DESC) and returned as { items, nextCursor }. The
  // previous hard `LIMIT 200` silently truncated all-time stats (streaks,
  // totals, "wrapped") for anyone with >200 completed entries — paginating lets
  // callers read everything page by page. The cursor is a position only; the
  // query is always re-scoped to the authenticated user.
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

  let sql = "SELECT * FROM completed_entries WHERE user_id = :uid AND deleted_at IS NULL";
  const params: Record<string, string | number> = { uid: userId };
  if (after) {
    params.ca = after.createdAt;
    params.cid = after.id;
    sql += " AND (completed_at < :ca OR (completed_at = :ca AND id < :cid))";
  }
  // Fetch one extra row to know whether a further page exists.
  params.lim = limit + 1;
  sql += " ORDER BY completed_at DESC, id DESC LIMIT :lim";
  const rows = await query<CompletedEntryRow>(sql, params);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? encodeCursor({ createdAt: last.completed_at, id: last.id })
    : null;

  return c.json({ items: page.map(rowToEntry), nextCursor });
});

// POST /completed/:id/reopen — uncomplete by log entry ID
app.post("/:id/reopen", async (c) => {
  const userId = c.get("userId") as string;
  const entryId = c.req.param("id");

  const entry = await queryOne<CompletedEntryRow>(
    "SELECT * FROM completed_entries WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: entryId, uid: userId }
  );
  if (!entry) return httpError(c, 404, "NOT_FOUND", "Not found");

  // Build the atomic batch: always delete the entry; conditionally reopen the task.
  // Using batch() ensures both writes succeed or both roll back — no orphaned state.
  // Tombstone on the entry (`deleted_at` + `updated_at`) and the task's
  // `updated_at` are all LWW/cursor keys → HLC.
  const now = hlcNow();
  const stmts: InStatement[] = [
    { sql: "UPDATE completed_entries SET deleted_at = :now, updated_at = :now WHERE id = :id", args: { id: entryId, now } },
  ];

  if (entry.task_id) {
    // Only reopen the task if it still exists (it may have been deleted separately).
    const task = await queryOne("SELECT id FROM tasks WHERE id = :id AND deleted_at IS NULL", { id: entry.task_id });
    if (task) {
      stmts.push({
        sql: "UPDATE tasks SET completed = 0, today = 1, updated_at = :now WHERE id = :id",
        args: { id: entry.task_id, now },
      });
    }
  }

  await batch(stmts);
  return c.json({ ok: true });
});

export default app;
