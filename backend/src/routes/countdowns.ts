import { Hono } from "hono";
import { validate } from "../lib/validate.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { query, queryOne, execute } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { hlcNow } from "../lib/hlc.js";
import type { Variables } from "../env.js";
import type { CountdownEventRow } from "../db/rows.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

const IdParam = z.object({ id: z.string().min(1).max(64) });

const CountdownBody = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  title: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  emoji: z.string().max(10).optional().nullable(),
  color: z.enum(["green", "cyan", "amber", "red"]).default("green"),
  repeat: z.enum(["none", "yearly"]).default("none"),
  note: z.string().max(2000).optional().nullable(),
  // `date` is always a solar (Gregorian) ISO anchor; `calendar` only records
  // which calendar the user authored in (affects display + lunar recurrence).
  calendar: z.enum(["solar", "lunar"]).default("solar"),
});

const CountdownUpdateBody = CountdownBody.partial();

// Bulk-import arrays are bounded so a single /migrate call can't force
// unbounded memory/CPU. The cap is set well above any realistic export
// (dozens of countdowns for even a heavy user) so no genuine migration is
// ever rejected — it only stops pathological millions-of-items payloads.
const MIGRATE_MAX_EVENTS = 10_000;

const MigrateBody = z.object({
  events: z.array(z.object({
    id: z.string().min(1).max(64),
    title: z.string().min(1).max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    emoji: z.string().max(10).optional().nullable(),
    color: z.enum(["green", "cyan", "amber", "red"]),
    repeat: z.enum(["none", "yearly"]),
    note: z.string().optional().nullable(),
    calendar: z.enum(["solar", "lunar"]).default("solar"),
    createdAt: z.string(),
  })).max(MIGRATE_MAX_EVENTS),
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
    calendar: row.calendar ?? "solar",
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
app.post("/migrate", validate("json", MigrateBody), async (c) => {
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
app.post("/", validate("json", CountdownBody), async (c) => {
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
app.patch("/:id", validate("param", IdParam), validate("json", CountdownUpdateBody), async (c) => {
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
