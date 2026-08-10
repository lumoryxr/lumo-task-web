import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import { query, queryOne, execute } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireAdmin, isAdminUser } from "../lib/admin.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { validate } from "../lib/validate.js";
import { httpError } from "../lib/errors.js";
import {
  CreateFeedbackBodySchema,
  UpdateFeedbackBodySchema,
  FeedbackCategorySchema,
  FeedbackStatusSchema,
  type FeedbackWire,
  type AdminFeedbackWire,
} from "@lumo/contracts";
import type { Variables } from "../env.js";
import type { FeedbackRow } from "../db/rows.js";

// Request/response shapes are owned by @lumo/contracts (Contract-First).

const IdParam = z.object({ id: z.string().min(1).max(64) });

// Defensive mapping: category/status are validated on every write, but `.catch`
// keeps one legacy/hand-edited row from 500-ing an entire list — it degrades to
// a safe default (open/other) instead of throwing.
function rowToFeedback(row: FeedbackRow): FeedbackWire {
  return {
    id: row.id,
    message: row.message,
    category: FeedbackCategorySchema.catch("other").parse(row.category),
    status: FeedbackStatusSchema.catch("open").parse(row.status),
    response: row.response ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToAdminFeedback(
  row: FeedbackRow & { submitter_email: string | null; submitter_name: string | null },
): AdminFeedbackWire {
  return {
    ...rowToFeedback(row),
    submitter: {
      user_id: row.user_id,
      email: row.submitter_email ?? null,
      name: row.submitter_name ?? "",
    },
  };
}

// ── User-facing router (mounted at /v1/feedback) ─────────────────────────────
export const feedbackRoutes = new Hono<{ Variables: Variables }>();
feedbackRoutes.use("/*", authMiddleware);

// Anti-spam: cap submissions per user. Keyed by userId (set by authMiddleware),
// so one account cannot flood the queue. Bypassed under the test harness via
// LUMO_DISABLE_RATE_LIMIT=1.
const submitLimiter = createRateLimiter<{ Variables: Variables }>(
  20,
  10 * 60 * 1000,
  (c) => `feedback:${c.get("userId")}`,
);

// GET /feedback — the caller's own feedback (newest first) + admin capability.
feedbackRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await query<FeedbackRow>(
    "SELECT * FROM feedback WHERE user_id = :uid ORDER BY created_at DESC",
    { uid: userId },
  );
  return c.json({ feedback: rows.map(rowToFeedback), isAdmin: await isAdminUser(userId) });
});

// POST /feedback — submit new feedback.
feedbackRoutes.post("/", submitLimiter, validate("json", CreateFeedbackBodySchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const id = "fb_" + nanoid(12);
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO feedback (id, user_id, message, category, status, response, created_at, updated_at)
     VALUES (:id, :uid, :message, :category, 'open', NULL, :now, :now)`,
    { id, uid: userId, message: body.message, category: body.category, now },
  );

  const row = await queryOne<FeedbackRow>("SELECT * FROM feedback WHERE id = :id", { id });
  return c.json({ feedback: rowToFeedback(row!) }, 201);
});

// ── Admin router (mounted at /v1/admin/feedback) ─────────────────────────────
export const adminFeedbackRoutes = new Hono<{ Variables: Variables }>();
adminFeedbackRoutes.use("/*", authMiddleware);
adminFeedbackRoutes.use("/*", requireAdmin);

// A row joined with its submitter's identity (for the admin queue only).
type AdminFeedbackJoinRow = FeedbackRow & {
  submitter_email: string | null;
  submitter_name: string | null;
};

// GET /admin/feedback — every item, newest first, with submitter identity.
adminFeedbackRoutes.get("/", async (c) => {
  const rows = await query<AdminFeedbackJoinRow>(
    `SELECT f.*, u.email AS submitter_email, u.name AS submitter_name
       FROM feedback f
       JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC`,
  );
  return c.json({ feedback: rows.map(rowToAdminFeedback) });
});

// PATCH /admin/feedback/:id — change status and/or write a reply.
adminFeedbackRoutes.patch(
  "/:id",
  validate("param", IdParam),
  validate("json", UpdateFeedbackBodySchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const existing = await queryOne<FeedbackRow>("SELECT * FROM feedback WHERE id = :id", { id });
    if (!existing) return httpError(c, 404, "NOT_FOUND", "Feedback not found");

    const now = new Date().toISOString();
    await execute(
      `UPDATE feedback
          SET status = :status, response = :response, updated_at = :now
        WHERE id = :id`,
      {
        status: body.status ?? existing.status,
        // `response` present (incl. null) replaces; absent keeps the current one.
        response: body.response !== undefined ? body.response : existing.response,
        now,
        id,
      },
    );

    const joined = await queryOne<AdminFeedbackJoinRow>(
      `SELECT f.*, u.email AS submitter_email, u.name AS submitter_name
         FROM feedback f JOIN users u ON u.id = f.user_id
        WHERE f.id = :id`,
      { id },
    );
    return c.json({ feedback: rowToAdminFeedback(joined!) });
  },
);

// Keep a default export too, so app.ts can mount the user router uniformly.
export default feedbackRoutes;
