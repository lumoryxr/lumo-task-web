import { query, execute, execRaw } from "./client.js";

// The backend NEVER seeds any account, in any environment. There is no default
// or demo user: real users register via POST /v1/auth/register, and test
// fixtures create users through that same public API. A hardcoded-credential
// account would be a publicly loginable hole on the live backend.

export async function runMigrations() {
  // ── Core tables ──────────────────────────────────────────────────────────────
  await execRaw(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      local INTEGER NOT NULL DEFAULT 0,
      plan TEXT DEFAULT 'free',
      renews_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await execRaw(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      assignee_ids TEXT NOT NULL DEFAULT '[]',
      title_en TEXT NOT NULL,
      title_zh TEXT,
      desc_en TEXT,
      desc_zh TEXT,
      quadrant TEXT NOT NULL DEFAULT 'unclassified',
      today INTEGER NOT NULL DEFAULT 0,
      due TEXT,
      duration INTEGER NOT NULL DEFAULT 0,
      pomos_done INTEGER NOT NULL DEFAULT 0,
      pomos_total INTEGER NOT NULL DEFAULT 0,
      conviction REAL,
      next_step_en TEXT,
      next_step_zh TEXT,
      reason_en TEXT,
      reason_zh TEXT,
      ai_suggest TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      not_now_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await execRaw(`
    CREATE TABLE IF NOT EXISTS completed_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      task_id TEXT,
      title_en TEXT NOT NULL,
      title_zh TEXT,
      duration INTEGER NOT NULL DEFAULT 0,
      quadrant TEXT,
      started_at TEXT,
      completed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await execRaw(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      color TEXT NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await execRaw(`
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      locale TEXT NOT NULL DEFAULT 'en',
      accent TEXT NOT NULL DEFAULT 'green',
      density TEXT NOT NULL DEFAULT 'comfortable',
      reduced_motion INTEGER NOT NULL DEFAULT 0,
      ai_enabled INTEGER NOT NULL DEFAULT 1,
      pomodoro_duration INTEGER NOT NULL DEFAULT 25,
      short_break INTEGER NOT NULL DEFAULT 5,
      long_break INTEGER NOT NULL DEFAULT 15,
      long_break_interval INTEGER NOT NULL DEFAULT 4,
      auto_start_breaks INTEGER NOT NULL DEFAULT 0,
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      onboarding_complete INTEGER NOT NULL DEFAULT 0
    )
  `);

  // ── Incremental migrations ───────────────────────────────────────────────────

  // Migrate: rename assignee_id → assignee_ids (JSON array)
  const taskCols = await query<{ name: string }>("PRAGMA table_info(tasks)");
  const hasOldCol = taskCols.some((c) => c.name === "assignee_id");
  const hasNewCol = taskCols.some((c) => c.name === "assignee_ids");
  if (hasOldCol && !hasNewCol) {
    await execRaw("ALTER TABLE tasks ADD COLUMN assignee_ids TEXT NOT NULL DEFAULT '[]'");
    await execRaw("UPDATE tasks SET assignee_ids = json_array(assignee_id) WHERE assignee_id IS NOT NULL AND assignee_id != ''");
  } else if (!hasNewCol) {
    await execRaw("ALTER TABLE tasks ADD COLUMN assignee_ids TEXT NOT NULL DEFAULT '[]'");
  }

  // Migrate: add AI config columns to settings
  const settingsCols = await query<{ name: string }>("PRAGMA table_info(settings)");
  if (!settingsCols.some((c) => c.name === "ai_provider")) {
    await execRaw("ALTER TABLE settings ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'openai'");
    await execRaw("ALTER TABLE settings ADD COLUMN ai_api_key TEXT");
    await execRaw("ALTER TABLE settings ADD COLUMN ai_base_url TEXT");
    await execRaw("ALTER TABLE settings ADD COLUMN ai_model TEXT");
  }

  // Migrate: per-provider AI configs
  if (!settingsCols.some((c) => c.name === "ai_configs")) {
    await execRaw("ALTER TABLE settings ADD COLUMN ai_configs TEXT NOT NULL DEFAULT '{}'");
    const rows = await query<any>(
      "SELECT user_id, ai_provider, ai_api_key, ai_model, ai_base_url FROM settings WHERE ai_api_key IS NOT NULL AND ai_api_key != ''"
    );
    for (const row of rows) {
      const provider = row.ai_provider ?? "openai";
      const cfg: Record<string, unknown> = {};
      cfg[provider] = { key: row.ai_api_key, model: row.ai_model ?? "", baseUrl: row.ai_base_url ?? "" };
      await execute("UPDATE settings SET ai_configs = :cfg WHERE user_id = :uid", {
        cfg: JSON.stringify(cfg),
        uid: row.user_id,
      });
    }
  }

  // Revoked tokens table
  await execRaw(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti  TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL
    )
  `);

  // Index the expiry so the prune below (and growth control) stays cheap.
  await execRaw("CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at)");

  // Prune expired tokens
  await execRaw("DELETE FROM revoked_tokens WHERE expires_at < datetime('now')");

  // Sync cursor tracking for remote LibSQL replication
  await execRaw(`
    CREATE TABLE IF NOT EXISTS sync_cursors (
      table_name     TEXT PRIMARY KEY,
      last_pushed_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
      last_pulled_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'
    )
  `);

  // Migrate: add recurrence column
  const taskColsV2 = await query<{ name: string }>("PRAGMA table_info(tasks)");
  if (!taskColsV2.some((c) => c.name === "recurrence")) {
    await execRaw("ALTER TABLE tasks ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'");
  }

  // Migrate: week_focus flag
  const taskColsWeekFocus = await query<{ name: string }>("PRAGMA table_info(tasks)");
  if (!taskColsWeekFocus.some((c) => c.name === "week_focus")) {
    await execRaw("ALTER TABLE tasks ADD COLUMN week_focus INTEGER NOT NULL DEFAULT 0");
  }

  // Migrate: subtasks + scheduled_start
  const taskColsV3 = await query<{ name: string }>("PRAGMA table_info(tasks)");
  if (!taskColsV3.some((c) => c.name === "subtasks_json")) {
    await execRaw("ALTER TABLE tasks ADD COLUMN subtasks_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!taskColsV3.some((c) => c.name === "scheduled_start")) {
    await execRaw("ALTER TABLE tasks ADD COLUMN scheduled_start TEXT");
  }

  // Migrate: normalize due field to strict ISO YYYY-MM-DD (or null)
  {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const tmr = new Date(now.getTime() + 86400000);
    const tomorrowISO = `${tmr.getFullYear()}-${pad(tmr.getMonth() + 1)}-${pad(tmr.getDate())}`;
    await execute("UPDATE tasks SET due = :d WHERE due IN ('today', '今天')", { d: todayISO });
    await execute("UPDATE tasks SET due = :d WHERE due IN ('tomorrow', '明天')", { d: tomorrowISO });

    // Parse "Mon DD" (e.g. "Jun 20") and "M月D日" (e.g. "6月20日") before nulling
    const MONTHS: Record<string, number> = {
      jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
      jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
    };
    const nonISO = await query<{ id: string; due: string }>(
      "SELECT id, due FROM tasks WHERE due IS NOT NULL " +
      "AND NOT (LENGTH(due) = 10 AND SUBSTR(due, 5, 1) = '-' AND SUBSTR(due, 8, 1) = '-')"
    );
    for (const row of nonISO) {
      const raw = row.due.trim().toLowerCase();
      let normalized: string | null = null;
      const enMatch = raw.match(/^([a-z]+)\s+(\d{1,2})$/);
      if (enMatch) {
        const mo = MONTHS[enMatch[1].slice(0, 3)];
        if (mo) {
          const yr = now.getMonth() + 1 > mo ? now.getFullYear() + 1 : now.getFullYear();
          normalized = `${yr}-${pad(mo)}-${pad(parseInt(enMatch[2], 10))}`;
        }
      }
      const zhMatch = raw.match(/^(\d{1,2})月(\d{1,2})日?$/);
      if (!normalized && zhMatch) {
        const mo = parseInt(zhMatch[1], 10);
        const yr = now.getMonth() + 1 > mo ? now.getFullYear() + 1 : now.getFullYear();
        normalized = `${yr}-${pad(mo)}-${pad(parseInt(zhMatch[2], 10))}`;
      }
      await execute("UPDATE tasks SET due = :due WHERE id = :id", { due: normalized, id: row.id });
    }

    // Null out anything remaining that is not a 10-char YYYY-MM-DD string
    await execRaw(
      "UPDATE tasks SET due = NULL WHERE due IS NOT NULL AND NOT " +
      "(LENGTH(due) = 10 AND SUBSTR(due, 5, 1) = '-' AND SUBSTR(due, 8, 1) = '-')"
    );
  }

  // Migrate: cloud AI usage tracking
  const settingsColsV2 = await query<{ name: string }>("PRAGMA table_info(settings)");
  if (!settingsColsV2.some((c) => c.name === "ai_cloud_used")) {
    await execRaw("ALTER TABLE settings ADD COLUMN ai_cloud_used INTEGER NOT NULL DEFAULT 0");
    await execRaw("ALTER TABLE settings ADD COLUMN ai_cloud_month TEXT NOT NULL DEFAULT ''");
  }

  // Migrate: remote sync credentials per user
  const settingsColsV3 = await query<{ name: string }>("PRAGMA table_info(settings)");
  if (!settingsColsV3.some((c) => c.name === "remote_url")) {
    await execRaw("ALTER TABLE settings ADD COLUMN remote_url TEXT");
    await execRaw("ALTER TABLE settings ADD COLUMN remote_token TEXT");
  }

  // Migrate: scheduled notification times
  const settingsColsV4 = await query<{ name: string }>("PRAGMA table_info(settings)");
  if (!settingsColsV4.some((c) => c.name === "morning_reminder_time")) {
    await execRaw("ALTER TABLE settings ADD COLUMN morning_reminder_time TEXT NOT NULL DEFAULT '09:00'");
    await execRaw("ALTER TABLE settings ADD COLUMN evening_reminder_time TEXT NOT NULL DEFAULT '18:00'");
  }
  if (!settingsColsV4.some((c) => c.name === "due_alerts_enabled")) {
    await execRaw("ALTER TABLE settings ADD COLUMN due_alerts_enabled INTEGER NOT NULL DEFAULT 1");
  }

  // Habits cloud persistence
  await execRaw(`
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      emoji TEXT,
      color TEXT NOT NULL DEFAULT 'green',
      frequency TEXT NOT NULL DEFAULT 'daily',
      frequency_days TEXT,
      frequency_times INTEGER,
      frequency_interval INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await execRaw(`
    CREATE TABLE IF NOT EXISTS habit_logs (
      habit_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      date TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (habit_id, user_id, date)
    )
  `);

  await execRaw(`
    CREATE TABLE IF NOT EXISTS countdown_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      emoji TEXT,
      color TEXT NOT NULL DEFAULT 'green',
      repeat TEXT NOT NULL DEFAULT 'none',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migrate: per-user session version. Tokens embed the version they were minted
  // with; bumping it (on password change) invalidates all prior tokens.
  const userColsSV = await query<{ name: string }>("PRAGMA table_info(users)");
  if (!userColsSV.some((col) => col.name === "session_version")) {
    await execRaw("ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0");
  }

  // Soft-delete (tombstones). Deletes set `deleted_at` instead of removing the
  // row, so the deletion can propagate to other devices during sync (ADR-0003)
  // instead of resurrecting. Every normal read filters `deleted_at IS NULL`.
  // Added to the syncable domains only; idempotent per column.
  for (const table of ["tasks", "completed_entries", "people", "habits", "countdown_events"]) {
    const cols = await query<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!cols.some((col) => col.name === "deleted_at")) {
      await execRaw(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
    }
  }

  // Secondary indexes on the multi-tenant tables. Every list/read query filters
  // by user_id (and sorts by created_at / completed_at / date); without these,
  // SQLite full-scans the shared table per request, which both slows reads and
  // — because scans hold the lock — starves the single writer at scale. The
  // composite (user_id, …sort/filter) shape lets the hot queries run as index
  // range scans with the ORDER BY already satisfied.
  //
  // The list indexes are PARTIAL (`WHERE deleted_at IS NULL`) so the hot path —
  // listing live rows — stays a tight index range scan even as tombstones
  // accumulate before GC, and tombstoned rows don't bloat the index.
  await execRaw(`
    CREATE INDEX IF NOT EXISTS idx_tasks_user_completed_created ON tasks(user_id, completed, created_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tasks_user_completed_quadrant ON tasks(user_id, completed, quadrant) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_completed_user_completedat ON completed_entries(user_id, completed_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_people_user_created ON people(user_id, created_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_habits_user_created ON habits(user_id, created_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date ON habit_logs(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_countdowns_user_created ON countdown_events(user_id, created_at) WHERE deleted_at IS NULL;
  `);

  // ── Incremental-sync change sequence (ADR-0003 Phase 2) ─────────────────────
  // Every syncable row carries a monotonic `seq` stamped from a single global
  // counter, advanced on INSERT *and* UPDATE (incl. soft-delete). The delta
  // endpoint reads `WHERE user_id = ? AND seq > :cursor ORDER BY seq`, so the
  // cursor is a server-authoritative high-water mark — not a wall clock (no
  // same-millisecond / NTP-rollback edge cases). seq is stamped by triggers, so
  // no write path needs to know about it.
  const SYNC_TABLES = ["tasks", "completed_entries", "people", "habits", "countdown_events"];

  await execRaw(`
    CREATE TABLE IF NOT EXISTS sync_seq (id INTEGER PRIMARY KEY CHECK (id = 1), value INTEGER NOT NULL);
    INSERT OR IGNORE INTO sync_seq (id, value) VALUES (1, 0);
  `);

  for (const table of SYNC_TABLES) {
    const cols = await query<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!cols.some((col) => col.name === "seq")) {
      await execRaw(`ALTER TABLE ${table} ADD COLUMN seq INTEGER`);
    }
    // Triggers stamp the next global seq. The AFTER UPDATE trigger guards with
    // `WHEN NEW.seq IS OLD.seq` so the seq-stamping update it issues does not
    // re-fire it (recursion-safe regardless of PRAGMA recursive_triggers). Each
    // trigger is one statement (execRaw splits on ';', which would break the
    // trigger body), so we run them via execute().
    await execute(
      `CREATE TRIGGER IF NOT EXISTS trg_${table}_seq_insert AFTER INSERT ON ${table}
       BEGIN
         UPDATE sync_seq SET value = value + 1 WHERE id = 1;
         UPDATE ${table} SET seq = (SELECT value FROM sync_seq WHERE id = 1) WHERE rowid = NEW.rowid;
       END`,
    );
    await execute(
      `CREATE TRIGGER IF NOT EXISTS trg_${table}_seq_update AFTER UPDATE ON ${table}
       WHEN NEW.seq IS OLD.seq
       BEGIN
         UPDATE sync_seq SET value = value + 1 WHERE id = 1;
         UPDATE ${table} SET seq = (SELECT value FROM sync_seq WHERE id = 1) WHERE rowid = NEW.rowid;
       END`,
    );
    // Delta read index: (user_id, seq) range scan with ORDER BY seq satisfied.
    await execRaw(`CREATE INDEX IF NOT EXISTS idx_${table}_user_seq ON ${table}(user_id, seq)`);
    // One-time, idempotent backfill of pre-existing rows: SET seq = seq fires the
    // update trigger (NEW.seq IS OLD.seq) to stamp; `WHERE seq IS NULL` makes a
    // re-run a no-op so seqs aren't churned on every startup.
    await execRaw(`UPDATE ${table} SET seq = seq WHERE seq IS NULL`);
  }
}

// When run directly as a script
if (process.argv[1]?.endsWith("migrate.ts") || process.argv[1]?.endsWith("migrate.js")) {
  runMigrations()
    .then(() => { console.log("Migrations complete."); process.exit(0); })
    .catch((err) => { console.error(err); process.exit(1); });
}
