import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../lib/validate.js";
import { nanoid } from "nanoid";
import { PersonCreateBodySchema, PersonUpdateBodySchema, type PersonWire } from "@lumo/contracts";
import { query, queryOne, execute } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import { hlcNow } from "../lib/hlc.js";
import { decodeCursor, encodeCursor, type CursorPos } from "../lib/cursor.js";
import type { Variables } from "../env.js";
import type { PersonRow } from "../db/rows.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

// A team is usually small; page size stays generous so ordinary callers get
// everyone in one request, while the cursor bounds a pathologically large team.
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

// Bound the :id path param at the request boundary, matching every sibling
// user-scoped resource (tasks/countdowns/habits/projects/templates). The contract
// caps a person id at ^[A-Za-z0-9_-]{1,64}$, so max(64) never rejects a real id —
// it only turns an oversized junk :id into a clean 400 instead of a DB round-trip.
const IdParam = z.object({ id: z.string().min(1).max(64) });

// Request/response shapes are owned by @lumo/contracts (Contract-First).
export function rowToPerson(row: PersonRow): PersonWire {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    color: row.color,
    email: row.email ?? null,
    created_at: row.created_at,
  };
}

// GET /people[?limit=&cursor=] → { items, nextCursor }
// Keyset-paginated by (created_at ASC, id ASC) so a large team never returns an
// unbounded array. The cursor is a position only; the query is always re-scoped
// to the authenticated user. Callers that want the whole list page through
// until nextCursor is null.
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
    let sql = "SELECT * FROM people WHERE user_id = :uid AND deleted_at IS NULL";
    const params: Record<string, string | number> = { uid: userId };
    if (after) {
      params.ca = after.createdAt;
      params.cid = after.id;
      sql += " AND (created_at > :ca OR (created_at = :ca AND id > :cid))";
    }
    // Fetch one extra row to know whether a further page exists.
    params.lim = limit + 1;
    sql += " ORDER BY created_at ASC, id ASC LIMIT :lim";
    const rows = await query<PersonRow>(sql, params);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last
      ? encodeCursor({ createdAt: last.created_at, id: last.id })
      : null;

    return c.json({ items: page.map(rowToPerson), nextCursor });
  } catch (err) {
    log("error", { requestId: c.get("requestId"), route: "GET /v1/people", msg: err instanceof Error ? err.message : String(err) });
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// POST /people
app.post("/", validate("json", PersonCreateBodySchema), async (c) => {
  const userId = c.get("userId") as string;
  const body = c.req.valid("json");
  const id = body.id ?? ("p_" + nanoid(10));
  const now = new Date().toISOString();
  // `updated_at` is the LWW/cursor key for sync → HLC (not a plain ISO string).
  const syncTs = hlcNow();
  await execute(`
    INSERT INTO people (id, user_id, name, initials, color, email, created_at, updated_at)
    VALUES (:id, :user_id, :name, :initials, :color, :email, :now, :sync_ts)
  `, { id, user_id: userId, name: body.name, initials: body.initials, color: body.color, email: body.email ?? null, now, sync_ts: syncTs });

  const row = await queryOne<PersonRow>("SELECT * FROM people WHERE id = :id AND deleted_at IS NULL", { id });
  return c.json(rowToPerson(row!), 201);
});

// PATCH /people/:id
app.patch("/:id", validate("param", IdParam), validate("json", PersonUpdateBodySchema), async (c) => {
  const userId = c.get("userId") as string;
  const personId = c.req.param("id");
  const body = c.req.valid("json");
  try {
    const existing = await queryOne<PersonRow>(
      "SELECT * FROM people WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
      { id: personId, uid: userId }
    );
    if (!existing) return httpError(c, 404, "NOT_FOUND", "Not found");

    await execute(`
      UPDATE people SET
        name = :name, initials = :initials, color = :color, email = :email,
        updated_at = :sync_ts
      WHERE id = :id AND user_id = :uid
    `, {
      name: body.name ?? existing.name,
      initials: body.initials ?? existing.initials,
      color: body.color ?? existing.color,
      email: "email" in body ? (body.email ?? null) : existing.email,
      sync_ts: hlcNow(),
      id: personId, uid: userId,
    });

    const row = await queryOne<PersonRow>("SELECT * FROM people WHERE id = :id AND deleted_at IS NULL", { id: personId });
    return c.json(rowToPerson(row!));
  } catch (err) {
    log("error", { requestId: c.get("requestId"), route: "PATCH /v1/people/:id", msg: err instanceof Error ? err.message : String(err) });
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// DELETE /people/:id
app.delete("/:id", validate("param", IdParam), async (c) => {
  const userId = c.get("userId") as string;
  const personId = c.req.param("id");
  try {
    // Tombstone: both `deleted_at` and `updated_at` ride the same LWW order → HLC.
    const now = hlcNow();
    const result = await execute(
      "UPDATE people SET deleted_at = :now, updated_at = :now WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
      { id: personId, uid: userId, now }
    );
    if (result.changes === 0) return httpError(c, 404, "NOT_FOUND", "Not found");

    // Remove this person from the assignee_ids JSON array on all affected tasks.
    // Use json_each instead of LIKE so that personId values containing % or _
    // do not accidentally match unrelated rows.
    await execute(`
      UPDATE tasks
      SET assignee_ids = (
        SELECT COALESCE(json_group_array(value), '[]')
        FROM json_each(assignee_ids)
        WHERE value != :pid
      ),
      updated_at = :now
      WHERE user_id = :uid
        AND EXISTS (
          SELECT 1 FROM json_each(assignee_ids) WHERE value = :pid
        )
    `, { pid: personId, uid: userId, now });

    return new Response(null, { status: 204 });
  } catch (err) {
    log("error", { requestId: c.get("requestId"), route: "DELETE /v1/people/:id", msg: err instanceof Error ? err.message : String(err) });
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

export default app;
