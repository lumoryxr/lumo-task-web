import { createClient, type Client } from "@libsql/client";
import { db, query, execute } from "../db/client.js";
import { decryptSecret } from "./crypto.js";

export type SyncStatus = "disabled" | "connecting" | "ok" | "error";

let remoteClient: Client | null = null;
let syncStatus: SyncStatus = "disabled";
let syncError: string | null = null;
let lastSyncAt: string | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;

export function getSyncStatus(): { status: SyncStatus; error: string | null; lastSyncAt: string | null } {
  return { status: syncStatus, error: syncError, lastSyncAt };
}

async function getRemoteConfig(): Promise<{ url: string; token: string } | null> {
  const envUrl = (process.env.LUMO_REMOTE_URL ?? "").trim();
  if (envUrl) return { url: envUrl, token: (process.env.LUMO_REMOTE_TOKEN ?? "").trim() };
  try {
    const row = await db.execute(
      "SELECT remote_url, remote_token FROM settings WHERE remote_url IS NOT NULL AND remote_url != '' LIMIT 1"
    );
    const r = row.rows[0] as any;
    if (r?.remote_url) return { url: r.remote_url as string, token: decryptSecret(r.remote_token as string | null) };
  } catch {}
  return null;
}

/**
 * The app-level table sync is a SINGLE-TENANT mechanism: getRemoteConfig() picks
 * one settings row (LIMIT 1) and syncTasks/syncCompletedEntries copy EVERY row
 * with no user_id scoping. That is correct only when the database holds exactly
 * one user (desktop / self-host). On a shared multi-tenant backend it would push
 * every tenant's data to a single user's remote DB — a cross-tenant data leak.
 * Until the per-user-database architecture replaces this path, hard-gate it to a
 * single-user database, checked at runtime on every cycle (a second user may
 * register after sync has started).
 */
export async function appLevelSyncAllowed(): Promise<boolean> {
  try {
    const rows = await query<{ n: number }>("SELECT COUNT(*) AS n FROM users");
    return Number(rows[0]?.n ?? 0) <= 1;
  } catch {
    // Fail closed: if we can't confirm single-tenancy, do not sync.
    return false;
  }
}

async function ensureRemoteSchema(client: Client): Promise<void> {
  const tables = [
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL, initials TEXT NOT NULL, local INTEGER NOT NULL DEFAULT 0, plan TEXT DEFAULT 'free', renews_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, assignee_ids TEXT NOT NULL DEFAULT '[]', title_en TEXT NOT NULL, title_zh TEXT, desc_en TEXT, desc_zh TEXT, quadrant TEXT NOT NULL DEFAULT 'unclassified', today INTEGER NOT NULL DEFAULT 0, due TEXT, duration INTEGER NOT NULL DEFAULT 0, pomos_done INTEGER NOT NULL DEFAULT 0, pomos_total INTEGER NOT NULL DEFAULT 0, conviction REAL, next_step_en TEXT, next_step_zh TEXT, reason_en TEXT, reason_zh TEXT, ai_suggest TEXT, completed INTEGER NOT NULL DEFAULT 0, not_now_json TEXT NOT NULL DEFAULT '[]', recurrence TEXT NOT NULL DEFAULT 'none', subtasks_json TEXT NOT NULL DEFAULT '[]', scheduled_start TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS completed_entries (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, task_id TEXT, title_en TEXT NOT NULL, title_zh TEXT, duration INTEGER NOT NULL DEFAULT 0, quadrant TEXT, started_at TEXT, completed_at TEXT NOT NULL DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS settings (user_id TEXT PRIMARY KEY, locale TEXT NOT NULL DEFAULT 'en', accent TEXT NOT NULL DEFAULT 'green', density TEXT NOT NULL DEFAULT 'comfortable', reduced_motion INTEGER NOT NULL DEFAULT 0, ai_enabled INTEGER NOT NULL DEFAULT 1, pomodoro_duration INTEGER NOT NULL DEFAULT 25, short_break INTEGER NOT NULL DEFAULT 5, long_break INTEGER NOT NULL DEFAULT 15, long_break_interval INTEGER NOT NULL DEFAULT 4, auto_start_breaks INTEGER NOT NULL DEFAULT 0, notifications_enabled INTEGER NOT NULL DEFAULT 1, onboarding_complete INTEGER NOT NULL DEFAULT 0, ai_provider TEXT NOT NULL DEFAULT 'openai', ai_configs TEXT NOT NULL DEFAULT '{}', ai_cloud_used INTEGER NOT NULL DEFAULT 0, ai_cloud_month TEXT NOT NULL DEFAULT '', remote_url TEXT, remote_token TEXT)",
    "CREATE TABLE IF NOT EXISTS sync_cursors (table_name TEXT PRIMARY KEY, last_pushed_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z', last_pulled_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z')",
  ];
  for (const sql of tables) await client.execute(sql);
}

async function getCursor(table: string): Promise<{ lastPushedAt: string; lastPulledAt: string }> {
  const rows = await query<{ last_pushed_at: string; last_pulled_at: string }>(
    "SELECT last_pushed_at, last_pulled_at FROM sync_cursors WHERE table_name = :t",
    { t: table }
  );
  const row = rows[0];
  return {
    lastPushedAt: row?.last_pushed_at ?? "1970-01-01T00:00:00.000Z",
    lastPulledAt: row?.last_pulled_at ?? "1970-01-01T00:00:00.000Z",
  };
}

async function updateCursor(table: string, pushed: string | null, pulled: string | null): Promise<void> {
  const epoch = "1970-01-01T00:00:00.000Z";
  await execute(
    "INSERT INTO sync_cursors (table_name, last_pushed_at, last_pulled_at) VALUES (:t, COALESCE(:pushed, :epoch), COALESCE(:pulled, :epoch)) ON CONFLICT(table_name) DO UPDATE SET last_pushed_at = COALESCE(:pushed, last_pushed_at), last_pulled_at = COALESCE(:pulled, last_pulled_at)",
    { t: table, pushed, pulled, epoch }
  );
}

async function syncTasks(client: Client): Promise<void> {
  const { lastPushedAt, lastPulledAt } = await getCursor("tasks");
  const now = new Date().toISOString();

  const localRows = await query<any>("SELECT * FROM tasks WHERE updated_at > :ts", { ts: lastPushedAt });
  if (localRows.length > 0) {
    await client.batch(
      localRows.map((row: any) => ({
        sql: "INSERT OR REPLACE INTO tasks (id,user_id,assignee_ids,title_en,title_zh,desc_en,desc_zh,quadrant,today,due,duration,pomos_done,pomos_total,conviction,next_step_en,next_step_zh,reason_en,reason_zh,ai_suggest,completed,not_now_json,recurrence,subtasks_json,scheduled_start,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        args: [row.id, row.user_id, row.assignee_ids ?? "[]", row.title_en, row.title_zh ?? null, row.desc_en ?? null, row.desc_zh ?? null, row.quadrant, row.today, row.due ?? null, row.duration, row.pomos_done, row.pomos_total, row.conviction ?? null, row.next_step_en ?? null, row.next_step_zh ?? null, row.reason_en ?? null, row.reason_zh ?? null, row.ai_suggest ?? null, row.completed, row.not_now_json ?? "[]", row.recurrence ?? "none", row.subtasks_json ?? "[]", row.scheduled_start ?? null, row.created_at, row.updated_at],
      })),
      "write"
    );
    await updateCursor("tasks", now, null);
  }

  const remote = await client.execute({ sql: "SELECT * FROM tasks WHERE updated_at > ?", args: [lastPulledAt] });
  if (remote.rows.length > 0) {
    const cols = remote.columns;
    for (const row of remote.rows) {
      const r: Record<string, any> = {};
      cols.forEach((c, i) => { r[c] = row[i]; });
      await execute(
        "INSERT INTO tasks (id,user_id,assignee_ids,title_en,title_zh,desc_en,desc_zh,quadrant,today,due,duration,pomos_done,pomos_total,conviction,next_step_en,next_step_zh,reason_en,reason_zh,ai_suggest,completed,not_now_json,recurrence,subtasks_json,scheduled_start,created_at,updated_at) VALUES (:id,:user_id,:assignee_ids,:title_en,:title_zh,:desc_en,:desc_zh,:quadrant,:today,:due,:duration,:pomos_done,:pomos_total,:conviction,:next_step_en,:next_step_zh,:reason_en,:reason_zh,:ai_suggest,:completed,:not_now_json,:recurrence,:subtasks_json,:scheduled_start,:created_at,:updated_at) ON CONFLICT(id) DO UPDATE SET assignee_ids=excluded.assignee_ids,title_en=excluded.title_en,title_zh=excluded.title_zh,desc_en=excluded.desc_en,desc_zh=excluded.desc_zh,quadrant=excluded.quadrant,today=excluded.today,due=excluded.due,duration=excluded.duration,pomos_done=excluded.pomos_done,pomos_total=excluded.pomos_total,conviction=excluded.conviction,next_step_en=excluded.next_step_en,next_step_zh=excluded.next_step_zh,reason_en=excluded.reason_en,reason_zh=excluded.reason_zh,ai_suggest=excluded.ai_suggest,completed=excluded.completed,not_now_json=excluded.not_now_json,recurrence=excluded.recurrence,subtasks_json=excluded.subtasks_json,scheduled_start=excluded.scheduled_start,updated_at=excluded.updated_at WHERE excluded.updated_at > tasks.updated_at",
        { id: r.id, user_id: r.user_id, assignee_ids: r.assignee_ids ?? "[]", title_en: r.title_en, title_zh: r.title_zh ?? null, desc_en: r.desc_en ?? null, desc_zh: r.desc_zh ?? null, quadrant: r.quadrant, today: r.today, due: r.due ?? null, duration: r.duration, pomos_done: r.pomos_done, pomos_total: r.pomos_total, conviction: r.conviction ?? null, next_step_en: r.next_step_en ?? null, next_step_zh: r.next_step_zh ?? null, reason_en: r.reason_en ?? null, reason_zh: r.reason_zh ?? null, ai_suggest: r.ai_suggest ?? null, completed: r.completed, not_now_json: r.not_now_json ?? "[]", recurrence: r.recurrence ?? "none", subtasks_json: r.subtasks_json ?? "[]", scheduled_start: r.scheduled_start ?? null, created_at: r.created_at, updated_at: r.updated_at }
      );
    }
    await updateCursor("tasks", null, now);
  }
}

async function syncCompletedEntries(client: Client): Promise<void> {
  const { lastPushedAt, lastPulledAt } = await getCursor("completed_entries");
  const now = new Date().toISOString();

  const localRows = await query<any>("SELECT * FROM completed_entries WHERE completed_at > :ts", { ts: lastPushedAt });
  if (localRows.length > 0) {
    await client.batch(
      localRows.map((row: any) => ({
        sql: "INSERT OR IGNORE INTO completed_entries (id,user_id,task_id,title_en,title_zh,duration,quadrant,started_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?)",
        args: [row.id, row.user_id, row.task_id ?? null, row.title_en, row.title_zh ?? null, row.duration, row.quadrant ?? null, row.started_at ?? null, row.completed_at],
      })),
      "write"
    );
    await updateCursor("completed_entries", now, null);
  }

  const remote = await client.execute({ sql: "SELECT * FROM completed_entries WHERE completed_at > ?", args: [lastPulledAt] });
  if (remote.rows.length > 0) {
    const cols = remote.columns;
    for (const row of remote.rows) {
      const r: Record<string, any> = {};
      cols.forEach((c, i) => { r[c] = row[i]; });
      await execute(
        "INSERT OR IGNORE INTO completed_entries (id,user_id,task_id,title_en,title_zh,duration,quadrant,started_at,completed_at) VALUES (:id,:user_id,:task_id,:title_en,:title_zh,:duration,:quadrant,:started_at,:completed_at)",
        { id: r.id, user_id: r.user_id, task_id: r.task_id ?? null, title_en: r.title_en, title_zh: r.title_zh ?? null, duration: r.duration, quadrant: r.quadrant ?? null, started_at: r.started_at ?? null, completed_at: r.completed_at }
      );
    }
    await updateCursor("completed_entries", null, now);
  }
}

async function runSyncCycle(client: Client): Promise<void> {
  // Re-check every cycle: refuse the moment the DB stops being single-tenant
  // (e.g. a second user registered after sync started). This narrows the leak to
  // at most one in-flight cycle; the per-user-database architecture eliminates it
  // entirely by removing the unscoped copy.
  if (!(await appLevelSyncAllowed())) {
    console.warn("[sync] stopped: database is no longer single-tenant; app-level sync disabled");
    stopSync();
    return;
  }
  await syncTasks(client);
  await syncCompletedEntries(client);
  lastSyncAt = new Date().toISOString();
  syncStatus = "ok";
  syncError = null;
  console.log("[sync] cycle complete at " + lastSyncAt);
}

export async function initSync(): Promise<void> {
  const cfg = await getRemoteConfig();
  if (!cfg) { syncStatus = "disabled"; return; }

  // Never run the single-tenant app-level sync against a multi-tenant database.
  if (!(await appLevelSyncAllowed())) {
    syncStatus = "disabled";
    syncError = null;
    console.warn("[sync] refused: app-level sync is single-tenant only; multiple users present");
    return;
  }

  try {
    syncStatus = "connecting";
    console.log("[sync] connecting to " + cfg.url);
    remoteClient = createClient({ url: cfg.url, authToken: cfg.token || undefined });
    await remoteClient.execute("SELECT 1");
    await ensureRemoteSchema(remoteClient);
    await runSyncCycle(remoteClient);

    // runSyncCycle may have detected multi-tenancy mid-init and called stopSync()
    // (which nulls remoteClient and clears the timer). Don't arm a no-op interval.
    if (!remoteClient) return;

    const intervalMs = Math.max(10_000, parseInt(process.env.LUMO_SYNC_INTERVAL ?? "60000"));
    syncTimer = setInterval(async () => {
      if (!remoteClient) return;
      try { await runSyncCycle(remoteClient); } catch (e: any) {
        syncError = e.message ?? "sync error";
        syncStatus = "error";
        console.error("[sync] periodic cycle failed:", e.message);
      }
    }, intervalMs);
  } catch (e: any) {
    syncStatus = "error";
    syncError = e.message ?? "connection failed";
    remoteClient = null;
    console.error("[sync] init failed:", e.message);
  }
}

export function stopSync(): void {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  remoteClient?.close();
  remoteClient = null;
  syncStatus = "disabled";
  syncError = null;
}

export async function triggerSync(): Promise<{ ok: boolean; error?: string }> {
  if (!remoteClient) {
    await initSync();
    return syncStatus === "ok" ? { ok: true } : { ok: false, error: syncError ?? "not configured" };
  }
  try {
    await runSyncCycle(remoteClient);
    return { ok: true };
  } catch (e: any) {
    syncError = e.message;
    syncStatus = "error";
    return { ok: false, error: e.message };
  }
}