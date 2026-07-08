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
  ProjectTemplatePayloadSchema,
  type TemplateWire,
} from "@lumo/contracts";
import type { Variables } from "../env.js";
import type { TemplateRow } from "../db/rows.js";

// Request/response shapes are owned by @lumo/contracts (Contract-First).
const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

const IdParam = z.object({ id: z.string().min(1).max(64) });

// The payload schema is kind-dependent: task templates carry a task blueprint,
// project templates a project blueprint. Anything else falls back to the task
// schema (legacy rows predate the kind split).
function payloadSchemaFor(kind: string) {
  return kind === "project" ? ProjectTemplatePayloadSchema : TemplatePayloadSchema;
}

// Map a DB row → wire shape. `payload` is stored as a JSON string. Read is
// LENIENT: a malformed/legacy payload (bad JSON, or missing a required field
// — reachable because the sync engine treats `payload` as an opaque string and
// never validates its contents) must NOT throw, or one bad row would 500 the
// entire list and hide every template. We `safeParse` and, on failure, fall
// back to a minimal valid payload seeded from the template name.
export function rowToTemplate(row: TemplateRow): TemplateWire {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(row.payload);
  } catch {
    parsed = {};
  }
  if (row.kind === "project") {
    const result = ProjectTemplatePayloadSchema.safeParse(parsed);
    const payload = result.success
      ? result.data
      : ProjectTemplatePayloadSchema.parse({ name: row.name });
    return { id: row.id, name: row.name, kind: row.kind, payload, created_at: row.created_at };
  }
  const result = TemplatePayloadSchema.safeParse(parsed);
  const payload = result.success
    ? result.data
    : TemplatePayloadSchema.parse({ title: { en: row.name } });
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    payload,
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
  // Re-encode through the kind's schema so stored JSON has defaults applied and
  // no unexpected keys ride along.
  const payload = JSON.stringify(payloadSchemaFor(body.kind).parse(body.payload));

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

  // Re-encode a replaced payload against the effective kind (patch may switch it).
  const effectiveKind = body.kind ?? existing.kind;
  let payload = existing.payload;
  if ("payload" in body && body.payload !== undefined) {
    // TemplateUpdateBodySchema.payload is a bare union of BOTH kinds' shapes, so a
    // payload matching the *other* kind passes the request validator and reaches
    // here. safeParse (not parse) so a wrong-kind / malformed payload degrades to a
    // clean 400 VALIDATION_ERROR instead of throwing a raw ZodError → 500 (routes
    // never throw HTTPException, so app.onError would treat a throw as a server fault).
    const result = payloadSchemaFor(effectiveKind).safeParse(body.payload);
    if (!result.success) {
      const fields = result.error.issues.map((issue: z.ZodIssue) => ({
        path: ["payload", ...issue.path.map(String)].join("."),
        message: issue.message,
      }));
      return httpError(
        c,
        400,
        "VALIDATION_ERROR",
        fields.map((f) => `${f.path}: ${f.message}`).join("; "),
        fields,
      );
    }
    payload = JSON.stringify(result.data);
  }

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
