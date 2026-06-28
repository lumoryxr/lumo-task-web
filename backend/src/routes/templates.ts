import { Hono } from "hono";
import { validate } from "../lib/validate.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { query, queryOne, execute } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { hlcNow } from "../lib/hlc.js";
import {
  TemplateCreateBodySchema,
  TemplateUpdateBodySchema,
  TemplatePayloadSchema,
  type TemplateWire,
} from "@lumo/contracts";
import type { Variables } from "../env.js";
import type { TemplateRow } from "../db/rows.js";

// Request/response shapes are owned by @lumo/contracts (Contract-First).
const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

const IdParam = z.object({ id: z.string().min(1).max(64) });

// Map a DB row → wire shape. `payload` is stored as a JSON string; parse it back
// and re-validate through the contract schema so a malformed/legacy row is
// coerced to its defaults rather than leaking raw text to the client.
export function rowToTemplate(row: TemplateRow): TemplateWire {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(row.payload);
  } catch {
    parsed = {};
  }
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    payload: TemplatePayloadSchema.parse(parsed),
    created_at: row.created_at,
  };
}

// GET /templates
app.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await query<TemplateRow>(
    "SELECT * FROM templates WHERE user_id = :uid AND deleted_at IS NULL ORDER BY created_at DESC",
    { uid: userId }
  );
  return c.json(rows.map(rowToTemplate));
});

// POST /templates
app.post("/", validate("json", TemplateCreateBodySchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const id = body.id ?? "tpl_" + nanoid(10);
  const now = new Date().toISOString();
  // `updated_at` is the LWW/cursor key for sync → HLC.
  const syncTs = hlcNow();
  // Re-encode through the schema so stored JSON has defaults applied and no
  // unexpected keys ride along.
  const payload = JSON.stringify(TemplatePayloadSchema.parse(body.payload));

  await execute(
    `INSERT INTO templates
       (id, user_id, name, kind, payload, created_at, updated_at)
     VALUES
       (:id, :user_id, :name, :kind, :payload, :now, :sync_ts)`,
    {
      id,
      user_id: userId,
      name: body.name,
      kind: body.kind,
      payload,
      now,
      sync_ts: syncTs,
    }
  );

  const row = await queryOne<TemplateRow>(
    "SELECT * FROM templates WHERE id = :id AND deleted_at IS NULL",
    { id }
  );
  return c.json(rowToTemplate(row!), 201);
});

// PATCH /templates/:id — rename or replace payload.
app.patch("/:id", validate("param", IdParam), validate("json", TemplateUpdateBodySchema), async (c) => {
  const userId = c.get("userId");
  const templateId = c.req.param("id");
  const body = c.req.valid("json");
  const now = hlcNow();

  const existing = await queryOne<TemplateRow>(
    "SELECT * FROM templates WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: templateId, uid: userId }
  );
  if (!existing) return httpError(c, 404, "NOT_FOUND", "Template not found");

  const payload =
    "payload" in body && body.payload !== undefined
      ? JSON.stringify(TemplatePayloadSchema.parse(body.payload))
      : existing.payload;

  await execute(
    `UPDATE templates SET
       name = :name, kind = :kind, payload = :payload, updated_at = :now
     WHERE id = :id AND user_id = :uid`,
    {
      name: body.name ?? existing.name,
      kind: body.kind ?? existing.kind,
      payload,
      now,
      id: templateId,
      uid: userId,
    }
  );

  const row = await queryOne<TemplateRow>(
    "SELECT * FROM templates WHERE id = :id AND deleted_at IS NULL",
    { id: templateId }
  );
  return c.json(rowToTemplate(row!));
});

// DELETE /templates/:id — soft-delete (tombstone). Deleting a template does not
// touch any task previously instantiated from it.
app.delete("/:id", validate("param", IdParam), async (c) => {
  const userId = c.get("userId");
  const now = hlcNow();
  const result = await execute(
    "UPDATE templates SET deleted_at = :now, updated_at = :now WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
    { id: c.req.param("id"), uid: userId, now }
  );
  if (result.changes === 0) return httpError(c, 404, "NOT_FOUND", "Template not found");
  return new Response(null, { status: 204 });
});

export default app;
