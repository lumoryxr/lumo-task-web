import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { TaskCreateBodySchema, TaskUpdateBodySchema, TaskListQuerySchema, TaskWireSchema, type TaskWire, type TaskCompleteResponse } from "@lumo/contracts";
import { nanoid } from "nanoid";
import { query, queryOne, execute, batch } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { decodeCursor, encodeCursor, type CursorPos } from "../lib/cursor.js";
import { idempotent } from "../lib/idempotency.js";
import type { Variables } from "../env.js";
import type { TaskRow } from "../db/rows.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

// 60 task mutations per minute per user
const taskMutateLimit = createRateLimiter<{ Variables: Variables }>(60, 60_000, (c) => c.get("userId") as string);

function calcNextDue(currentDue: string | null, recurrence: string): string | null {
  const base = currentDue ? new Date(currentDue) : new Date();
  const d = new Date(base);
  if (recurrence === "daily") {
    d.setDate(d.getDate() + 1);
  } else if (recurrence === "weekdays") {
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  } else if (recurrence === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (recurrence === "monthly") {
    d.setMonth(d.getMonth() + 1);
  } else {
    return null;
  }
  return d.toISOString().slice(0, 10);
}

const IdParam = z.object({ id: z.string().min(1).max(50) });

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

// Validate the DB row → wire mapping against the contract on every read, so the
// response is guaranteed conformant (writes always pass through the contract, so
// this never throws for clean data; it surfaces drift instead of leaking it).
export function rowToTask(row: TaskRow): TaskWire {
  return TaskWireSchema.parse({
    id: row.id,
    assignee_ids: safeParse<string[]>(row.assignee_ids, []),
    title: { en: row.title_en, ...(row.title_zh ? { zh: row.title_zh } : {}) },
    desc: row.desc_en ? { en: row.desc_en, ...(row.desc_zh ? { zh: row.desc_zh } : {}) } : null,
    quadrant: row.quadrant,
    today: Boolean(row.today),
    week_focus: Boolean(row.week_focus),
    due: row.due ?? null,
    duration: row.duration,
    pomos_done: row.pomos_done,
    pomos_total: row.pomos_total,
    conviction: row.conviction ?? null,
    next_step: row.next_step_en ? { en: row.next_step_en, ...(row.next_step_zh ? { zh: row.next_step_zh } : {}) } : null,
    reason: row.reason_en ? { en: row.reason_en, ...(row.reason_zh ? { zh: row.reason_zh } : {}) } : null,
    ai_suggest: row.ai_suggest ?? null,
    completed: Boolean(row.completed),
    not_now: safeParse<unknown[]>(row.not_now_json, []),
    recurrence: row.recurrence ?? "none",
    subtasks: safeParse<unknown[]>(row.subtasks_json, []),
    scheduled_start: row.scheduled_start ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

// GET /tasks?q=<keyword>
// Without `q`: returns the user's incomplete tasks (unchanged behaviour).
// With `q`: case-insensitive keyword match over title/description in both
// locales. LIKE wildcards in the user input are escaped so they are treated as
// literals, not patterns. All values are bound parameters (no SQLi surface).
// Keyset (cursor) paginated. limit is always applied (default 50, max 200 via
// the contract) so the response is bounded; the cursor seeks via the
// (user_id, completed, created_at) index, tie-broken by id for a stable total
// order. Always re-scoped to the authenticated user — the cursor is just a
// position, never an authorization token.
app.get("/", zValidator("query", TaskListQuerySchema), async (c) => {
  const userId = c.get("userId") as string;
  const { q, limit, cursor } = c.req.valid("query");

  let after: CursorPos | null = null;
  if (cursor) {
    try {
      after = decodeCursor(cursor);
    } catch {
      return httpError(c, 400, "INVALID_CURSOR", "Invalid cursor");
    }
  }

  // Base read keeps the always-present filters — including `deleted_at IS NULL`
  // — inside this literal, so the soft-delete-filter standards scan can verify
  // it statically. Optional clauses (search, keyset cursor) are appended below.
  let sql = "SELECT * FROM tasks WHERE user_id = :uid AND completed = 0 AND deleted_at IS NULL";
  const params: Record<string, string | number> = { uid: userId };

  if (q) {
    params.q = `%${q.replace(/[\\%_]/g, (ch) => "\\" + ch)}%`;
    sql +=
      " AND (title_en LIKE :q ESCAPE '\\' OR title_zh LIKE :q ESCAPE '\\'" +
      " OR desc_en LIKE :q ESCAPE '\\' OR desc_zh LIKE :q ESCAPE '\\')";
  }
  if (after) {
    params.ca = after.createdAt;
    params.cid = after.id;
    sql += " AND (created_at > :ca OR (created_at = :ca AND id > :cid))";
  }

  // Fetch one extra row to know whether a further page exists.
  params.lim = limit + 1;
  sql += " ORDER BY created_at ASC, id ASC LIMIT :lim";
  const rows = await query<TaskRow>(sql, params);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? encodeCursor({ createdAt: last.created_at, id: last.id })
    : null;

  return c.json({ items: page.map(rowToTask), nextCursor });
});

// POST /tasks
app.post("/", taskMutateLimit, zValidator("json", TaskCreateBodySchema), async (c) => {
  const userId = c.get("userId") as string;
  const body = c.req.valid("json");
  return idempotent(c, async () => {
  const id = body.id ?? ("t_" + nanoid(10));
  const now = new Date().toISOString();

  await execute(`
    INSERT INTO tasks (
      id, user_id, assignee_ids, title_en, title_zh, desc_en, desc_zh,
      quadrant, today, week_focus, due, duration, pomos_done, pomos_total, conviction,
      next_step_en, next_step_zh, reason_en, reason_zh, ai_suggest, not_now_json,
      recurrence, subtasks_json, scheduled_start, created_at, updated_at
    ) VALUES (
      :id, :user_id, :assignee_ids, :title_en, :title_zh, :desc_en, :desc_zh,
      :quadrant, :today, :week_focus, :due, :duration, 0, :pomos_total, :conviction,
      :next_step_en, :next_step_zh, :reason_en, :reason_zh, :ai_suggest, :not_now_json,
      :recurrence, :subtasks_json, :scheduled_start, :now, :now
    )
  `, {
    id, user_id: userId,
    assignee_ids: JSON.stringify(body.assignee_ids ?? []),
    title_en: body.title.en, title_zh: body.title.zh ?? null,
    desc_en: body.desc?.en ?? null, desc_zh: body.desc?.zh ?? null,
    quadrant: body.quadrant ?? "unclassified",
    today: body.today ? 1 : 0,
    week_focus: body.week_focus ? 1 : 0,
    due: body.due ?? null,
    duration: body.duration ?? 0,
    pomos_total: body.pomos_total ?? 0,
    conviction: body.conviction ?? null,
    next_step_en: body.next_step?.en ?? null, next_step_zh: body.next_step?.zh ?? null,
    reason_en: body.reason?.en ?? null, reason_zh: body.reason?.zh ?? null,
    recurrence: body.recurrence ?? "none",
    ai_suggest: body.ai_suggest ?? null,
    not_now_json: JSON.stringify(body.not_now ?? []),
    subtasks_json: JSON.stringify(body.subtasks ?? []),
    scheduled_start: body.scheduled_start ?? null,
    now,
  });

  const row = await queryOne<TaskRow>("SELECT * FROM tasks WHERE id = :id AND deleted_at IS NULL", { id });
  return { status: 201, body: rowToTask(row!) };
  });
});

// GET /tasks/:id
app.get("/:id", zValidator("param", IdParam), async (c) => {
  const userId = c.get("userId") as string;
  const row = await queryOne<TaskRow>(
    "SELECT * FROM tasks WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: c.req.param("id"), uid: userId }
  );
  if (!row) return httpError(c, 404, "NOT_FOUND", "Not found");
  return c.json(rowToTask(row));
});

// PATCH /tasks/:id
app.patch("/:id", taskMutateLimit, zValidator("param", IdParam), zValidator("json", TaskUpdateBodySchema), async (c) => {
  const userId = c.get("userId") as string;
  const taskId = c.req.param("id");
  const body = c.req.valid("json");
  const now = new Date().toISOString();

  const existing = await queryOne<TaskRow>(
    "SELECT * FROM tasks WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: taskId, uid: userId }
  );
  if (!existing) return httpError(c, 404, "NOT_FOUND", "Not found");

  const merged = {
    assignee_ids: "assignee_ids" in body ? JSON.stringify(body.assignee_ids ?? []) : existing.assignee_ids,
    title_en: body.title?.en ?? existing.title_en,
    title_zh: body.title?.zh ?? existing.title_zh ?? null,
    desc_en: "desc" in body ? (body.desc?.en ?? null) : existing.desc_en,
    desc_zh: "desc" in body ? (body.desc?.zh ?? null) : existing.desc_zh,
    quadrant: body.quadrant ?? existing.quadrant,
    today: "today" in body ? (body.today ? 1 : 0) : existing.today,
    week_focus: "week_focus" in body ? (body.week_focus ? 1 : 0) : existing.week_focus,
    due: "due" in body ? (body.due ?? null) : existing.due,
    duration: body.duration ?? existing.duration,
    pomos_total: body.pomos_total ?? existing.pomos_total,
    conviction: "conviction" in body ? (body.conviction ?? null) : existing.conviction,
    next_step_en: "next_step" in body ? (body.next_step?.en ?? null) : existing.next_step_en,
    next_step_zh: "next_step" in body ? (body.next_step?.zh ?? null) : existing.next_step_zh,
    reason_en: "reason" in body ? (body.reason?.en ?? null) : existing.reason_en,
    reason_zh: "reason" in body ? (body.reason?.zh ?? null) : existing.reason_zh,
    ai_suggest: "ai_suggest" in body ? (body.ai_suggest ?? null) : existing.ai_suggest,
    not_now_json: "not_now" in body ? JSON.stringify(body.not_now) : existing.not_now_json,
    recurrence: body.recurrence ?? existing.recurrence ?? "none",
    subtasks_json: "subtasks" in body ? JSON.stringify(body.subtasks) : (existing.subtasks_json ?? "[]"),
    scheduled_start: "scheduled_start" in body ? (body.scheduled_start ?? null) : existing.scheduled_start,
  };

  await execute(`
    UPDATE tasks SET
      assignee_ids = :assignee_ids, title_en = :title_en, title_zh = :title_zh,
      desc_en = :desc_en, desc_zh = :desc_zh, quadrant = :quadrant,
      today = :today, week_focus = :week_focus, due = :due, duration = :duration, pomos_total = :pomos_total,
      conviction = :conviction, next_step_en = :next_step_en, next_step_zh = :next_step_zh,
      reason_en = :reason_en, reason_zh = :reason_zh, ai_suggest = :ai_suggest,
      not_now_json = :not_now_json, recurrence = :recurrence,
      subtasks_json = :subtasks_json, scheduled_start = :scheduled_start, updated_at = :now
    WHERE id = :id AND user_id = :uid
  `, { ...merged, id: taskId, uid: userId, now });

  const row = await queryOne<TaskRow>("SELECT * FROM tasks WHERE id = :id AND deleted_at IS NULL", { id: taskId });
  return c.json(rowToTask(row!));
});

// DELETE /tasks/:id
app.delete("/:id", zValidator("param", IdParam), async (c) => {
  const userId = c.get("userId") as string;
  const now = new Date().toISOString();
  // Soft delete (tombstone) so the deletion propagates on sync instead of
  // resurrecting. `deleted_at IS NULL` guard makes a repeat delete a 404, as
  // before. The row stays; every read filters `deleted_at IS NULL`.
  const result = await execute(
    "UPDATE tasks SET deleted_at = :now, updated_at = :now WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: c.req.param("id"), uid: userId, now }
  );
  if (result.changes === 0) return httpError(c, 404, "NOT_FOUND", "Not found");
  return new Response(null, { status: 204 });
});

// POST /tasks/:id/complete
app.post("/:id/complete", zValidator("param", IdParam), async (c) => {
  const userId = c.get("userId") as string;
  const taskId = c.req.param("id");

  const task = await queryOne<TaskRow>(
    "SELECT * FROM tasks WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: taskId, uid: userId }
  );
  if (!task) return httpError(c, 404, "NOT_FOUND", "Not found");

  const now = new Date().toISOString();
  const entryId = "c_" + nanoid(10);
  const recurrence = task.recurrence ?? "none";

  const stmts: Parameters<typeof batch>[0] = [
    {
      sql: `INSERT INTO completed_entries (id, user_id, task_id, title_en, title_zh, duration, quadrant, started_at, completed_at)
            VALUES (:id, :user_id, :task_id, :title_en, :title_zh, :duration, :quadrant, :started_at, :completed_at)`,
      args: {
        id: entryId, user_id: userId, task_id: taskId,
        title_en: task.title_en, title_zh: task.title_zh ?? null,
        duration: task.duration, quadrant: task.quadrant,
        started_at: null, completed_at: now,
      },
    },
    {
      sql: "UPDATE tasks SET completed = 1, updated_at = :now WHERE id = :id",
      args: { id: taskId, now },
    },
  ];

  // Auto-spawn next recurrence
  if (recurrence !== "none") {
    const nextDue = calcNextDue(task.due ?? null, recurrence);
    const nextId = "t_" + nanoid(10);
    stmts.push({
      sql: `INSERT INTO tasks (
              id, user_id, assignee_ids, title_en, title_zh, desc_en, desc_zh,
              quadrant, today, due, duration, pomos_done, pomos_total, conviction,
              next_step_en, next_step_zh, reason_en, reason_zh, ai_suggest, not_now_json,
              recurrence, created_at, updated_at
            ) VALUES (
              :id, :user_id, :assignee_ids, :title_en, :title_zh, :desc_en, :desc_zh,
              :quadrant, 0, :due, :duration, 0, :pomos_total, NULL,
              NULL, NULL, NULL, NULL, NULL, '[]',
              :recurrence, :now, :now
            )`,
      args: {
        id: nextId, user_id: userId,
        assignee_ids: task.assignee_ids ?? "[]",
        title_en: task.title_en, title_zh: task.title_zh ?? null,
        desc_en: task.desc_en ?? null, desc_zh: task.desc_zh ?? null,
        quadrant: task.quadrant,
        due: nextDue,
        duration: task.duration, pomos_total: task.pomos_total,
        recurrence,
        now,
      },
    });
  }

  await batch(stmts);
  const body: TaskCompleteResponse = { ok: true, entry_id: entryId };
  return c.json(body);
});

// POST /tasks/:id/uncomplete
app.post("/:id/uncomplete", zValidator("param", IdParam), async (c) => {
  const userId = c.get("userId") as string;
  const taskId = c.req.param("id");

  const task = await queryOne(
    "SELECT * FROM tasks WHERE id = :id AND user_id = :uid AND completed = 1 AND deleted_at IS NULL",
    { id: taskId, uid: userId }
  );
  if (!task) return httpError(c, 404, "NOT_FOUND", "Not found");

  const now = new Date().toISOString();

  await batch([
    {
      sql: "UPDATE tasks SET completed = 0, updated_at = :now WHERE id = :id",
      args: { id: taskId, now },
    },
    {
      // Soft-delete the completed-log rows so the removal propagates on sync.
      sql: "UPDATE completed_entries SET deleted_at = :now WHERE task_id = :task_id AND user_id = :uid AND deleted_at IS NULL",
      args: { task_id: taskId, uid: userId, now },
    },
  ]);

  const row = await queryOne<TaskRow>("SELECT * FROM tasks WHERE id = :id AND deleted_at IS NULL", { id: taskId });
  return c.json(rowToTask(row!));
});

export default app;
