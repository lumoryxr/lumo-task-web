import { Hono } from "hono";
import { validate } from "../lib/validate.js";
import { FocusSessionBodySchema } from "@lumo/contracts";
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

// `started_at` is the wall-clock time the pomodoro began, persisted verbatim into
// `completed_entries.started_at`. Bound it to an ISO 8601 date-time — matching the
// endpoint's own published contract (`format: date-time`, routes/docs.ts) and the
// app-wide datetime-anchor convention (task scheduled_start/remind_at, countdown
// date, habit check-in date). The regex is a deliberate SUPERSET: it accepts both
// the client's real wire format (`new Date().toISOString()` → `…THH:MM:SS.sssZ`)
// and the shorter `scheduled_start` shape (`YYYY-MM-DDTHH:MM`), so nothing
// currently valid is newly rejected — while junk and date-only values (no time
// component) are now a clean 400 instead of silently poisoning stored history.
const STARTED_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?$/;

// `duration` is the session length in minutes, persisted verbatim into
// `completed_entries.duration` and summed into Stats totals. Bound it to
// POST /focus/sessions
app.post("/sessions", focusRateLimit, validate("json", FocusSessionBodySchema), async (c) => {
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
        INSERT INTO completed_entries (id, user_id, task_id, title_en, title_zh, duration, quadrant, started_at, completed_at, updated_at, project_id, tags_json)
        VALUES (:id, :user_id, :task_id, :title_en, :title_zh, :duration, :quadrant, :started_at, :completed_at, :sync_ts, :project_id, :tags_json)
      `, {
        id: entryId, user_id: userId, task_id: body.task_id,
        title_en: task.title_en, title_zh: task.title_zh ?? null,
        duration: body.duration, quadrant: task.quadrant,
        started_at: body.started_at ?? null, completed_at: now, sync_ts: syncTs,
        project_id: task.project_id ?? null, tags_json: task.tags_json ?? "[]",
      });

      // Scope the write by `user_id` too: the SELECT above already gates this
      // branch to the caller's own task, but keeping the UPDATE self-defending
      // means a future refactor of that gate can't silently turn this into a
      // cross-tenant IDOR (pomos_done is the only mutable cross-tenant surface
      // here). Defense-in-depth — no happy-path change.
      await execute(
        "UPDATE tasks SET pomos_done = pomos_done + 1, updated_at = :sync_ts WHERE id = :id AND user_id = :uid",
        { id: body.task_id, sync_ts: syncTs, uid: userId }
      );
    }
  }

  return c.json({ ok: true, entry_id: entryId });
});

export default app;
