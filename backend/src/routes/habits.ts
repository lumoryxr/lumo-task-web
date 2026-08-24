import { Hono } from "hono";
import { validate } from "../lib/validate.js";
import {
  HabitCreateBodySchema,
  HabitUpdateBodySchema,
  HabitLogBodySchema,
  HabitMigrateBodySchema,
} from "@lumo/contracts";
import { z } from "zod";
import { nanoid } from "nanoid";
import { query, queryOne, execute } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import { hlcNow } from "../lib/hlc.js";
import { decodeCursor, encodeCursor, type CursorPos } from "../lib/cursor.js";
import type { Variables } from "../env.js";
import type { HabitRow, HabitLogRow } from "../db/rows.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

// Most users have a handful of habits; the page size stays generous so ordinary
// callers get them all in one request, while the cursor bounds a pathologically
// large account. Matches people/projects/countdowns (DEFAULT 200 / MAX 500).
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

const IdParam = z.object({ id: z.string().min(1).max(64) });

const LogParam = z.object({
  id: z.string().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function rowToHabit(row: HabitRow) {
  return {
    id: row.id,
    title: row.title,
    emoji: row.emoji ?? undefined,
    color: row.color,
    frequency: row.frequency,
    frequencyDays: row.frequency_days ? (JSON.parse(row.frequency_days) as number[]) : undefined,
    frequencyTimes: row.frequency_times ?? undefined,
    frequencyInterval: row.frequency_interval ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToLog(row: HabitLogRow) {
  return {
    habitId: row.habit_id,
    date: row.date,
    completedAt: row.completed_at,
  };
}

// GET /habits[?limit=&cursor=] → { items, nextCursor }
// Keyset-paginated by (created_at ASC, id ASC) so a heavy account never returns
// an unbounded array. The cursor is a position only; the query is always
// re-scoped to the authenticated user. Callers that want the whole list page
// through until nextCursor is null.
app.get("/", async (c) => {
  const userId = c.get("userId") as string;

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

  try {
    let sql = "SELECT * FROM habits WHERE user_id = :uid AND deleted_at IS NULL";
    const params: Record<string, string | number> = { uid: userId };
    if (after) {
      params.ca = after.createdAt;
      params.cid = after.id;
      sql += " AND (created_at > :ca OR (created_at = :ca AND id > :cid))";
    }
    // Fetch one extra row to know whether a further page exists.
    params.lim = limit + 1;
    sql += " ORDER BY created_at ASC, id ASC LIMIT :lim";
    const rows = await query<HabitRow>(sql, params);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last
      ? encodeCursor({ createdAt: last.created_at, id: last.id })
      : null;

    return c.json({ items: page.map(rowToHabit), nextCursor });
  } catch (err) {
    log("error", { requestId: c.get("requestId"), route: "GET /v1/habits", msg: err instanceof Error ? err.message : String(err) });
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// GET /habits/logs — must be before /:id
app.get("/logs", async (c) => {
  const userId = c.get("userId");
  const rows = await query<HabitLogRow>(
    "SELECT * FROM habit_logs WHERE user_id = :uid ORDER BY date ASC",
    { uid: userId }
  );
  return c.json(rows.map(rowToLog));
});

// POST /habits/migrate — idempotent bulk import; must be before /:id
app.post("/migrate", validate("json", HabitMigrateBodySchema), async (c) => {
  const userId = c.get("userId");
  const { habits, logs } = c.req.valid("json");

  for (const h of habits) {
    await execute(
      `INSERT OR IGNORE INTO habits
         (id, user_id, title, emoji, color, frequency, frequency_days, frequency_times, frequency_interval, note, created_at, updated_at)
       VALUES
         (:id, :user_id, :title, :emoji, :color, :frequency, :frequency_days, :frequency_times, :frequency_interval, :note, :created_at, :updated_at)`,
      {
        id: h.id,
        user_id: userId,
        title: h.title,
        emoji: h.emoji ?? null,
        color: h.color,
        frequency: h.frequency,
        frequency_days: h.frequencyDays ? JSON.stringify(h.frequencyDays) : null,
        frequency_times: h.frequencyTimes ?? null,
        frequency_interval: h.frequencyInterval ?? null,
        note: h.note ?? null,
        created_at: h.createdAt,
        // `updated_at` is the LWW/cursor key → must be canonical HLC, never the
        // client's raw ISO `createdAt` (a 3-digit ISO sorts before all HLC
        // values and would silently lose every sync race). Stamp import time.
        updated_at: hlcNow(),
      }
    );
  }

  // Only import logs that reference a habit owned by this user. A log's
  // habit_id is client-supplied, so without this guard a caller could write
  // rows keyed to another user's habit and pollute the shared key space.
  const owned = await query<{ id: string }>(
    "SELECT id FROM habits WHERE user_id = :uid AND deleted_at IS NULL",
    { uid: userId }
  );
  const ownedIds = new Set(owned.map((h) => h.id));

  let migratedLogs = 0;
  for (const l of logs) {
    if (!ownedIds.has(l.habitId)) continue;
    await execute(
      `INSERT OR IGNORE INTO habit_logs (habit_id, user_id, date, completed_at)
       VALUES (:habit_id, :user_id, :date, :completed_at)`,
      { habit_id: l.habitId, user_id: userId, date: l.date, completed_at: l.completedAt }
    );
    migratedLogs++;
  }

  return c.json({ ok: true, migrated: { habits: habits.length, logs: migratedLogs } });
});

// POST /habits
app.post("/", validate("json", HabitCreateBodySchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const id = body.id ?? ("habit_" + nanoid(10));
  const now = new Date().toISOString();
  // `updated_at` is the LWW/cursor key for sync → HLC.
  const syncTs = hlcNow();

  await execute(
    `INSERT INTO habits
       (id, user_id, title, emoji, color, frequency, frequency_days, frequency_times, frequency_interval, note, created_at, updated_at)
     VALUES
       (:id, :user_id, :title, :emoji, :color, :frequency, :frequency_days, :frequency_times, :frequency_interval, :note, :now, :sync_ts)`,
    {
      id,
      user_id: userId,
      title: body.title,
      emoji: body.emoji ?? null,
      color: body.color,
      frequency: body.frequency,
      frequency_days: body.frequencyDays ? JSON.stringify(body.frequencyDays) : null,
      frequency_times: body.frequencyTimes ?? null,
      frequency_interval: body.frequencyInterval ?? null,
      note: body.note ?? null,
      now, sync_ts: syncTs,
    }
  );

  const row = await queryOne<HabitRow>("SELECT * FROM habits WHERE id = :id AND deleted_at IS NULL", { id });
  return c.json(rowToHabit(row!), 201);
});

// PATCH /habits/:id
app.patch("/:id", validate("param", IdParam), validate("json", HabitUpdateBodySchema), async (c) => {
  const userId = c.get("userId");
  const habitId = c.req.param("id");
  const body = c.req.valid("json");
  // `:now` here only feeds `updated_at` (the LWW/cursor key) → HLC.
  const now = hlcNow();

  const existing = await queryOne<HabitRow>(
    "SELECT * FROM habits WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: habitId, uid: userId }
  );
  if (!existing) return httpError(c, 404, "NOT_FOUND", "Habit not found");

  await execute(
    `UPDATE habits SET
       title = :title, emoji = :emoji, color = :color, frequency = :frequency,
       frequency_days = :frequency_days, frequency_times = :frequency_times,
       frequency_interval = :frequency_interval, note = :note, updated_at = :now
     WHERE id = :id AND user_id = :uid`,
    {
      title: body.title ?? existing.title,
      emoji: "emoji" in body ? (body.emoji ?? null) : existing.emoji,
      color: body.color ?? existing.color,
      frequency: body.frequency ?? existing.frequency,
      frequency_days: "frequencyDays" in body
        ? (body.frequencyDays ? JSON.stringify(body.frequencyDays) : null)
        : existing.frequency_days,
      frequency_times: "frequencyTimes" in body ? (body.frequencyTimes ?? null) : existing.frequency_times,
      frequency_interval: "frequencyInterval" in body ? (body.frequencyInterval ?? null) : existing.frequency_interval,
      note: "note" in body ? (body.note ?? null) : existing.note,
      now,
      id: habitId,
      uid: userId,
    }
  );

  const row = await queryOne<HabitRow>("SELECT * FROM habits WHERE id = :id AND deleted_at IS NULL", { id: habitId });
  return c.json(rowToHabit(row!));
});

// DELETE /habits/:id
app.delete("/:id", validate("param", IdParam), async (c) => {
  const userId = c.get("userId");
  const habitId = c.req.param("id");

  // Tombstone: both `deleted_at` and `updated_at` ride the LWW order → HLC.
  const now = hlcNow();
  // Soft delete the habit (tombstone, propagates on sync). habit_logs are
  // subordinate check-in rows (not a syncable domain in this phase) and are
  // hard-deleted with the habit as before.
  await execute(
    "DELETE FROM habit_logs WHERE habit_id = :id AND user_id = :uid",
    { id: habitId, uid: userId }
  );
  const result = await execute(
    "UPDATE habits SET deleted_at = :now, updated_at = :now WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: habitId, uid: userId, now }
  );
  if (result.changes === 0) return httpError(c, 404, "NOT_FOUND", "Habit not found");
  return new Response(null, { status: 204 });
});

// POST /habits/:id/log
app.post(
  "/:id/log",
  validate("param", IdParam),
  validate("json", HabitLogBodySchema),
  async (c) => {
    const userId = c.get("userId");
    const habitId = c.req.param("id");
    const { date } = c.req.valid("json");

    const habit = await queryOne<HabitRow>(
      "SELECT id FROM habits WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
      { id: habitId, uid: userId }
    );
    if (!habit) return httpError(c, 404, "NOT_FOUND", "Habit not found");

    const now = new Date().toISOString();
    await execute(
      `INSERT OR IGNORE INTO habit_logs (habit_id, user_id, date, completed_at)
       VALUES (:habit_id, :user_id, :date, :completed_at)`,
      { habit_id: habitId, user_id: userId, date, completed_at: now }
    );

    const row = await queryOne<HabitLogRow>(
      "SELECT * FROM habit_logs WHERE habit_id = :id AND user_id = :uid AND date = :date",
      { id: habitId, uid: userId, date }
    );
    return c.json(rowToLog(row!), 201);
  }
);

// DELETE /habits/:id/log/:date
app.delete("/:id/log/:date", validate("param", LogParam), async (c) => {
  const userId = c.get("userId");
  const { id: habitId, date } = c.req.valid("param");

  await execute(
    "DELETE FROM habit_logs WHERE habit_id = :id AND user_id = :uid AND date = :date",
    { id: habitId, uid: userId, date }
  );
  return new Response(null, { status: 204 });
});

export default app;
