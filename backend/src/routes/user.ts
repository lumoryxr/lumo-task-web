import { Hono } from "hono";
import { query, queryOne, batch } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import type { Variables } from "../env.js";
import { httpError } from "../lib/errors.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import type { UserRow } from "../db/rows.js";
import { dbMode } from "../db/client.js";
import type { UserProfileWire, DataExportWire } from "@lumo/contracts";

const app = new Hono<{ Variables: Variables }>();

// Data-ownership operations are rare and expensive (a full-account scan or a
// cascade delete), so they are rate-limited more tightly than ordinary reads.
const exportLimit = createRateLimiter<{ Variables: Variables }>(5, 60_000, (c) => c.get("userId") as string);
const deleteLimit = createRateLimiter<{ Variables: Variables }>(5, 60_000, (c) => c.get("userId") as string);

// Every table that carries the user's data, keyed by `user_id`. This is the
// single list that both the GDPR export and the account-deletion cascade walk,
// so a new per-user domain only has to be added here once.
const USER_SCOPED_TABLES = [
  "tasks",
  "completed_entries",
  "people",
  "settings",
  "habits",
  "habit_logs",
  "countdown_events",
  "templates",
  "projects",
  "refresh_tokens",
  "sync_client_state",
] as const;

app.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  try {
    const user = await queryOne<UserRow>("SELECT * FROM users WHERE id = :id", { id: userId });
    if (!user) return httpError(c, 404, "NOT_FOUND", "Not found");

    const taskStats = await queryOne<{ task_count: number; pomo_count: number }>(`
      SELECT
        COUNT(CASE WHEN completed = 0 THEN 1 END) as task_count,
        COALESCE(SUM(pomos_done), 0) as pomo_count
      FROM tasks WHERE user_id = :uid AND deleted_at IS NULL
    `, { uid: userId });

    const profile: UserProfileWire = {
      id: user.id,
      email: user.email,
      name: user.name,
      initials: user.initials,
      local: Boolean(user.local),
      plan: user.plan ?? "free",
      renewsAt: user.renews_at ?? null,
      stats: {
        tasks: taskStats?.task_count ?? 0,
        pomodoros: taskStats?.pomo_count ?? 0,
        syncOK: dbMode() !== "local",
      },
    };
    return c.json(profile);
  } catch (err) {
    console.error("[user] GET /:", err instanceof Error ? err.message : err);
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * GET /v1/user/export — GDPR/CCPA "download my data".
 *
 * Aggregates every row the caller owns across all domains into one JSON bundle.
 * Secrets are never included: the settings row is selected column-by-column so
 * the AI key / per-provider configs / sync token are excluded (a `has_ai_key`
 * boolean is surfaced instead), and the user identity omits the password hash
 * and the calendar-feed tokens.
 */
app.get("/export", authMiddleware, exportLimit, async (c) => {
  const uid = c.get("userId") as string;
  try {
    const user = await queryOne<UserRow>("SELECT * FROM users WHERE id = :id", { id: uid });
    if (!user) return httpError(c, 404, "NOT_FOUND", "Not found");

    type Row = Record<string, unknown>;
    // Explicit literal SELECTs (no interpolated table name) so the soft-delete
    // standards scanner can statically verify `deleted_at IS NULL` on every
    // soft-deletable read. The bundle reflects LIVE data, not tombstones.
    const [tasks, completed, people, habits, habitLogs, countdowns, projects, templates] =
      await Promise.all([
        query<Row>("SELECT * FROM tasks WHERE user_id = :uid AND deleted_at IS NULL", { uid }),
        query<Row>("SELECT * FROM completed_entries WHERE user_id = :uid AND deleted_at IS NULL", { uid }),
        query<Row>("SELECT * FROM people WHERE user_id = :uid AND deleted_at IS NULL", { uid }),
        query<Row>("SELECT * FROM habits WHERE user_id = :uid AND deleted_at IS NULL", { uid }),
        query<Row>("SELECT * FROM habit_logs WHERE user_id = :uid", { uid }),
        query<Row>("SELECT * FROM countdown_events WHERE user_id = :uid AND deleted_at IS NULL", { uid }),
        query<Row>("SELECT * FROM projects WHERE user_id = :uid AND deleted_at IS NULL", { uid }),
        query<Row>("SELECT * FROM templates WHERE user_id = :uid AND deleted_at IS NULL", { uid }),
      ]);

    // Settings: explicit non-secret column list. `ai_api_key`, `ai_configs`,
    // and `remote_token` are deliberately excluded; their presence is reduced
    // to a boolean so the export never carries a credential.
    const settings = await queryOne<Record<string, unknown>>(
      `SELECT
         locale, accent, density, reduced_motion, ai_enabled, ai_provider, ai_model,
         ai_base_url, pomodoro_duration, short_break, long_break, long_break_interval,
         auto_start_breaks, notifications_enabled, onboarding_complete, ai_cloud_used,
         ai_cloud_month, morning_reminder_time, evening_reminder_time, due_alerts_enabled,
         remote_url,
         CASE WHEN (ai_api_key IS NOT NULL AND ai_api_key != '')
                OR (ai_configs IS NOT NULL AND ai_configs != '' AND ai_configs != '{}')
              THEN 1 ELSE 0 END AS has_ai_key
       FROM settings WHERE user_id = :uid`,
      { uid },
    );

    const bundle: DataExportWire = {
      format_version: 1,
      exported_at: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        initials: user.initials,
        plan: user.plan ?? "free",
        created_at: user.created_at,
      },
      settings: settings ?? null,
      tasks,
      completed,
      people,
      habits,
      habit_logs: habitLogs,
      countdowns,
      projects,
      templates,
    };

    return c.json(bundle);
  } catch (err) {
    console.error("[user] GET /export:", err instanceof Error ? err.message : err);
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * DELETE /v1/user — irreversible account erasure (right to be forgotten).
 *
 * Removes every row the user owns across all domains plus the account itself in
 * a single atomic batch. No token revocation is needed: once the `users` row is
 * gone, the auth middleware's session lookup fails, so any outstanding access
 * token is rejected on its next use, and the refresh tokens are deleted here.
 */
app.delete("/", authMiddleware, deleteLimit, async (c) => {
  const uid = c.get("userId") as string;
  try {
    const user = await queryOne<{ id: string }>("SELECT id FROM users WHERE id = :id", { id: uid });
    if (!user) return httpError(c, 404, "NOT_FOUND", "Not found");

    const stmts = [
      ...USER_SCOPED_TABLES.map((table) => ({
        sql: `DELETE FROM ${table} WHERE user_id = :uid`,
        args: { uid },
      })),
      { sql: "DELETE FROM users WHERE id = :uid", args: { uid } },
    ];
    await batch(stmts);

    return c.json({ ok: true } as const);
  } catch (err) {
    console.error("[user] DELETE /:", err instanceof Error ? err.message : err);
    return httpError(c, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

export default app;
