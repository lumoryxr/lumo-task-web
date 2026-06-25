import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { nanoid } from "nanoid";
import { query, queryOne, execute } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import type { Variables } from "../env.js";
import type { CountdownEventRow } from "../db/rows.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

const IdParam = z.object({ id: z.string().min(1).max(64) });

const CountdownBody = z.object({
  title: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  emoji: z.string().max(10).optional().nullable(),
  color: z.enum(["green", "cyan", "amber", "red"]).default("green"),
  repeat: z.enum(["none", "yearly"]).default("none"),
  note: z.string().max(2000).optional().nullable(),
});

const CountdownUpdateBody = CountdownBody.partial();

const MigrateBody = z.object({
  events: z.array(z.object({
    id: z.string().min(1).max(64),
    title: z.string().min(1).max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    emoji: z.string().max(10).optional().nullable(),
    color: z.enum(["green", "cyan", "amber", "red"]),
    repeat: z.enum(["none", "yearly"]),
    note: z.string().optional().nullable(),
    createdAt: z.string(),
  })),
});

export function rowToEvent(row: CountdownEventRow) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    emoji: row.emoji ?? undefined,
    color: row.color,
    repeat: row.repeat,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

// GET /countdowns
app.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await query<CountdownEventRow>(
    "SELECT * FROM countdown_events WHERE user_id = :uid AND deleted_at IS NULL ORDER BY created_at ASC",
    { uid: userId }
  );
  return c.json(rows.map(rowToEvent));
});

// POST /countdowns/migrate — idempotent bulk import; must be before /:id
app.post("/migrate", zValidator("json", MigrateBody), async (c) => {
  const userId = c.get("userId");
  const { events } = c.req.valid("json");

  for (const e of events) {
    await execute(
      `INSERT OR IGNORE INTO countdown_events
         (id, user_id, title, date, emoji, color, repeat, note, created_at, updated_at)
       VALUES
         (:id, :user_id, :title, :date, :emoji, :color, :repeat, :note, :created_at, :updated_at)`,
      {
        id: e.id,
        user_id: userId,
        title: e.title,
        date: e.date,
        emoji: e.emoji ?? null,
        color: e.color,
        repeat: e.repeat,
        note: e.note ?? null,
        created_at: e.createdAt,
        updated_at: e.createdAt,
      }
    );
  }

  return c.json({ ok: true, migrated: events.length });
});

// POST /countdowns
app.post("/", zValidator("json", CountdownBody), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const id = "cd_" + nanoid(10);
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO countdown_events
       (id, user_id, title, date, emoji, color, repeat, note, created_at, updated_at)
     VALUES
       (:id, :user_id, :title, :date, :emoji, :color, :repeat, :note, :now, :now)`,
    {
      id,
      user_id: userId,
      title: body.title,
      date: body.date,
      emoji: body.emoji ?? null,
      color: body.color,
      repeat: body.repeat,
      note: body.note ?? null,
      now,
    }
  );

  const row = await queryOne<CountdownEventRow>(
    "SELECT * FROM countdown_events WHERE id = :id AND deleted_at IS NULL",
    { id }
  );
  return c.json(rowToEvent(row!), 201);
});

// PATCH /countdowns/:id
app.patch("/:id", zValidator("param", IdParam), zValidator("json", CountdownUpdateBody), async (c) => {
  const userId = c.get("userId");
  const eventId = c.req.param("id");
  const body = c.req.valid("json");
  const now = new Date().toISOString();

  const existing = await queryOne<CountdownEventRow>(
    "SELECT * FROM countdown_events WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: eventId, uid: userId }
  );
  if (!existing) return httpError(c, 404, "NOT_FOUND", "Countdown event not found");

  await execute(
    `UPDATE countdown_events SET
       title = :title, date = :date, emoji = :emoji, color = :color,
       repeat = :repeat, note = :note, updated_at = :now
     WHERE id = :id AND user_id = :uid`,
    {
      title: body.title ?? existing.title,
      date: body.date ?? existing.date,
      emoji: "emoji" in body ? (body.emoji ?? null) : existing.emoji,
      color: body.color ?? existing.color,
      repeat: body.repeat ?? existing.repeat,
      note: "note" in body ? (body.note ?? null) : existing.note,
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
app.delete("/:id", zValidator("param", IdParam), async (c) => {
  const userId = c.get("userId");
  const now = new Date().toISOString();
  const result = await execute(
    "UPDATE countdown_events SET deleted_at = :now, updated_at = :now WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: c.req.param("id"), uid: userId, now }
  );
  if (result.changes === 0) return httpError(c, 404, "NOT_FOUND", "Countdown event not found");
  return new Response(null, { status: 204 });
});

export default app;
