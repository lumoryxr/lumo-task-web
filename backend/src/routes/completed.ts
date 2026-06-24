import { Hono } from "hono";
import { query, queryOne, execute, batch } from "../db/client.js";
import type { InStatement } from "@libsql/client";
import { authMiddleware } from "../middleware/auth.js";
import type { Variables } from "../env.js";
import { httpError } from "../lib/errors.js";
import type { CompletedEntryRow } from "../db/rows.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

function rowToEntry(row: CompletedEntryRow) {
  return {
    id: row.id,
    task_id: row.task_id ?? null,
    title: { en: row.title_en, ...(row.title_zh ? { zh: row.title_zh } : {}) },
    duration: row.duration,
    quadrant: row.quadrant ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at,
  };
}

// GET /completed?date=YYYY-MM-DD
app.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const date = c.req.query("date");
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return httpError(c, 400, "INVALID_DATE", "date must be in YYYY-MM-DD format");
  }

  let rows: CompletedEntryRow[];
  if (date) {
    rows = await query<CompletedEntryRow>(`
      SELECT * FROM completed_entries
      WHERE user_id = :uid AND DATE(completed_at, 'localtime') = :date
      ORDER BY completed_at ASC
    `, { uid: userId, date });
  } else {
    rows = await query<CompletedEntryRow>(`
      SELECT * FROM completed_entries
      WHERE user_id = :uid
      ORDER BY completed_at DESC
      LIMIT 200
    `, { uid: userId });
  }

  return c.json(rows.map(rowToEntry));
});

// POST /completed/:id/reopen — uncomplete by log entry ID
app.post("/:id/reopen", async (c) => {
  const userId = c.get("userId") as string;
  const entryId = c.req.param("id");

  const entry = await queryOne<CompletedEntryRow>(
    "SELECT * FROM completed_entries WHERE id = :id AND user_id = :uid",
    { id: entryId, uid: userId }
  );
  if (!entry) return httpError(c, 404, "NOT_FOUND", "Not found");

  // Build the atomic batch: always delete the entry; conditionally reopen the task.
  // Using batch() ensures both writes succeed or both roll back — no orphaned state.
  const now = new Date().toISOString();
  const stmts: InStatement[] = [
    { sql: "DELETE FROM completed_entries WHERE id = :id", args: { id: entryId } },
  ];

  if (entry.task_id) {
    // Only reopen the task if it still exists (it may have been deleted separately).
    const task = await queryOne("SELECT id FROM tasks WHERE id = :id", { id: entry.task_id });
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
