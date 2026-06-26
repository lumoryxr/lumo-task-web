import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { nanoid } from "nanoid";
import { queryOne, execute } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import type { Variables } from "../env.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { hlcNow } from "../lib/hlc.js";
import type { FocusTaskRow } from "../db/rows.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

const focusRateLimit = createRateLimiter<{ Variables: Variables }>(10, 60_000, (c) => c.get("userId") as string);

const FocusSessionBody = z.object({
  task_id: z.string().nullable().optional(),
  duration: z.number().int().min(1),
  started_at: z.string().optional(),
});

// POST /focus/sessions
app.post("/sessions", focusRateLimit, zValidator("json", FocusSessionBody), async (c) => {
  const userId = c.get("userId") as string;
  const body = c.req.valid("json");
  const now = new Date().toISOString();
  // `completed_at` is wall-clock; the syncable rows' `updated_at` is the
  // LWW/cursor key → HLC.
  const syncTs = hlcNow();
  const entryId = "c_" + nanoid(10);

  if (body.task_id) {
    const task = await queryOne<FocusTaskRow>(
      "SELECT * FROM tasks WHERE id = :id AND user_id = :uid AND deleted_at IS NULL",
      { id: body.task_id, uid: userId }
    );
    if (task) {
      await execute(`
        INSERT INTO completed_entries (id, user_id, task_id, title_en, title_zh, duration, quadrant, started_at, completed_at, updated_at)
        VALUES (:id, :user_id, :task_id, :title_en, :title_zh, :duration, :quadrant, :started_at, :completed_at, :sync_ts)
      `, {
        id: entryId, user_id: userId, task_id: body.task_id,
        title_en: task.title_en, title_zh: task.title_zh ?? null,
        duration: body.duration, quadrant: task.quadrant,
        started_at: body.started_at ?? null, completed_at: now, sync_ts: syncTs,
      });

      await execute(
        "UPDATE tasks SET pomos_done = pomos_done + 1, updated_at = :sync_ts WHERE id = :id",
        { id: body.task_id, sync_ts: syncTs }
      );
    }
  }

  return c.json({ ok: true, entry_id: entryId });
});

export default app;
