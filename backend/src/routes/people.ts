import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { nanoid } from "nanoid";
import { PersonCreateBodySchema, PersonUpdateBodySchema, type PersonWire } from "@lumo/contracts";
import { query, queryOne, execute } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import type { Variables } from "../env.js";
import type { PersonRow } from "../db/rows.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

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

// GET /people
app.get("/", async (c) => {
  const userId = c.get("userId") as string;
  try {
    const rows = await query<PersonRow>(
      "SELECT * FROM people WHERE user_id = :uid AND deleted_at IS NULL ORDER BY created_at ASC",
      { uid: userId }
    );
    return c.json(rows.map(rowToPerson));
  } catch (err) {
    console.error("[people] GET /:", err instanceof Error ? err.message : err);
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// POST /people
app.post("/", zValidator("json", PersonCreateBodySchema), async (c) => {
  const userId = c.get("userId") as string;
  const body = c.req.valid("json");
  const id = body.id ?? ("p_" + nanoid(10));
  const now = new Date().toISOString();
  await execute(`
    INSERT INTO people (id, user_id, name, initials, color, email, created_at)
    VALUES (:id, :user_id, :name, :initials, :color, :email, :now)
  `, { id, user_id: userId, name: body.name, initials: body.initials, color: body.color, email: body.email ?? null, now });

  const row = await queryOne<PersonRow>("SELECT * FROM people WHERE id = :id AND deleted_at IS NULL", { id });
  return c.json(rowToPerson(row!), 201);
});

// PATCH /people/:id
app.patch("/:id", zValidator("json", PersonUpdateBodySchema), async (c) => {
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
        name = :name, initials = :initials, color = :color, email = :email
      WHERE id = :id AND user_id = :uid
    `, {
      name: body.name ?? existing.name,
      initials: body.initials ?? existing.initials,
      color: body.color ?? existing.color,
      email: "email" in body ? (body.email ?? null) : existing.email,
      id: personId, uid: userId,
    });

    const row = await queryOne<PersonRow>("SELECT * FROM people WHERE id = :id AND deleted_at IS NULL", { id: personId });
    return c.json(rowToPerson(row!));
  } catch (err) {
    console.error("[people] PATCH /:id:", err instanceof Error ? err.message : err);
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// DELETE /people/:id
app.delete("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const personId = c.req.param("id");
  try {
    const now = new Date().toISOString();
    // Soft delete (people has no updated_at column → set deleted_at only).
    const result = await execute(
      "UPDATE people SET deleted_at = :now WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
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
      )
      WHERE user_id = :uid
        AND EXISTS (
          SELECT 1 FROM json_each(assignee_ids) WHERE value = :pid
        )
    `, { pid: personId, uid: userId });

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("[people] DELETE /:id:", err instanceof Error ? err.message : err);
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

export default app;
