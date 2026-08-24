import { Hono } from "hono";
import { validate } from "../lib/validate.js";
import {
  CountdownCreateBodySchema,
  CountdownUpdateBodySchema,
  CountdownMigrateBodySchema,
} from "@lumo/contracts";
import { z } from "zod";
import { nanoid } from "nanoid";
import { query, queryOne, execute } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import { hlcNow } from "../lib/hlc.js";
import { decodeCursor, encodeCursor, type CursorPos } from "../lib/cursor.js";
import type { CountdownWire } from "@lumo/contracts";
import type { Variables } from "../env.js";
import type { CountdownEventRow } from "../db/rows.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

// Most users have a handful of countdowns; the page size stays generous so
// ordinary callers get them all in one request, while the cursor bounds a
// pathologically large account. Matches people/projects (DEFAULT 200 / MAX 500).
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

const IdParam = z.object({ id: z.string().min(1).max(64) });

export function rowToEvent(row: CountdownEventRow): CountdownWire {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    emoji: row.emoji ?? undefined,
    color: row.color,
    repeat: row.repeat,
    note: row.note ?? undefined,
    calendar: row.calendar ?? "solar",
    createdAt: row.created_at,
  };
}

// GET /countdowns[?limit=&cursor=] → { items, nextCursor }
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
    let sql = "SELECT * FROM countdown_events WHERE user_id = :uid AND deleted_at IS NULL";
    const params: Record<string, string | number> = { uid: userId };
    if (after) {
      params.ca = after.createdAt;
      params.cid = after.id;
      sql += " AND (created_at > :ca OR (created_at = :ca AND id > :cid))";
    }
    // Fetch one extra row to know whether a further page exists.
    params.lim = limit + 1;
    sql += " ORDER BY created_at ASC, id ASC LIMIT :lim";
    const rows = await query<CountdownEventRow>(sql, params);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last
      ? encodeCursor({ createdAt: last.created_at, id: last.id })
      : null;

    return c.json({ items: page.map(rowToEvent), nextCursor });
  } catch (err) {
    log("error", { requestId: c.get("requestId"), route: "GET /v1/countdowns", msg: err instanceof Error ? err.message : String(err) });
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// POST /countdowns/migrate — idempotent bulk import; must be before /:id
app.post("/migrate", validate("json", CountdownMigrateBodySchema), async (c) => {
  const userId = c.get("userId");
  const { events } = c.req.valid("json");

  for (const e of events) {
    await execute(
      `INSERT OR IGNORE INTO countdown_events
         (id, user_id, title, date, emoji, color, repeat, note, calendar, created_at, updated_at)
       VALUES
         (:id, :user_id, :title, :date, :emoji, :color, :repeat, :note, :calendar, :created_at, :updated_at)`,
      {
        id: e.id,
        user_id: userId,
        title: e.title,
        date: e.date,
        emoji: e.emoji ?? null,
        color: e.color,
        repeat: e.repeat,
        note: e.note ?? null,
        calendar: e.calendar,
        created_at: e.createdAt,
        // `updated_at` is the LWW/cursor key → canonical HLC, not the client's
        // raw ISO `createdAt` (3-digit ISO sorts before all HLC values and would
        // silently lose sync races). Stamp import time.
        updated_at: hlcNow(),
      }
    );
  }

  return c.json({ ok: true, migrated: events.length });
});

// POST /countdowns
app.post("/", validate("json", CountdownCreateBodySchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const id = body.id ?? ("cd_" + nanoid(10));
  const now = new Date().toISOString();
  // `updated_at` is the LWW/cursor key for sync → HLC.
  const syncTs = hlcNow();

  await execute(
    `INSERT INTO countdown_events
       (id, user_id, title, date, emoji, color, repeat, note, calendar, created_at, updated_at)
     VALUES
       (:id, :user_id, :title, :date, :emoji, :color, :repeat, :note, :calendar, :now, :sync_ts)`,
    {
      id,
      user_id: userId,
      title: body.title,
      date: body.date,
      emoji: body.emoji ?? null,
      color: body.color,
      repeat: body.repeat,
      note: body.note ?? null,
      calendar: body.calendar,
      now, sync_ts: syncTs,
    }
  );

  const row = await queryOne<CountdownEventRow>(
    "SELECT * FROM countdown_events WHERE id = :id AND deleted_at IS NULL",
    { id }
  );
  return c.json(rowToEvent(row!), 201);
});

// PATCH /countdowns/:id
app.patch("/:id", validate("param", IdParam), validate("json", CountdownUpdateBodySchema), async (c) => {
  const userId = c.get("userId");
  const eventId = c.req.param("id");
  const body = c.req.valid("json");
  // `:now` here only feeds `updated_at` (the LWW/cursor key) → HLC.
  const now = hlcNow();

  const existing = await queryOne<CountdownEventRow>(
    "SELECT * FROM countdown_events WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: eventId, uid: userId }
  );
  if (!existing) return httpError(c, 404, "NOT_FOUND", "Countdown event not found");

  await execute(
    `UPDATE countdown_events SET
       title = :title, date = :date, emoji = :emoji, color = :color,
       repeat = :repeat, note = :note, calendar = :calendar, updated_at = :now
     WHERE id = :id AND user_id = :uid`,
    {
      title: body.title ?? existing.title,
      date: body.date ?? existing.date,
      emoji: "emoji" in body ? (body.emoji ?? null) : existing.emoji,
      color: body.color ?? existing.color,
      repeat: body.repeat ?? existing.repeat,
      note: "note" in body ? (body.note ?? null) : existing.note,
      calendar: body.calendar ?? existing.calendar,
      now,
      id: eventId,
      uid: userId,
    }
  );

  const row = await queryOne<CountdownEventRow>(
    "SELECT * FROM countdown_events WHERE id = :id AND deleted_at IS NULL",
    { id: eventId }
  );
  return c.json(rowToEvent(row!));
});

// DELETE /countdowns/:id
app.delete("/:id", validate("param", IdParam), async (c) => {
  const userId = c.get("userId");
  // Tombstone: both `deleted_at` and `updated_at` ride the LWW order → HLC.
  const now = hlcNow();
  const result = await execute(
    "UPDATE countdown_events SET deleted_at = :now, updated_at = :now WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: c.req.param("id"), uid: userId, now }
  );
  if (result.changes === 0) return httpError(c, 404, "NOT_FOUND", "Countdown event not found");
  return new Response(null, { status: 204 });
});

export default app;
