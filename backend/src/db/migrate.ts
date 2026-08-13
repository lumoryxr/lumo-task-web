import { query, execute, execRaw, batch } from "./client.js";

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
    // Atomic: add the column and backfill it together, so a crash between the
    // two can't leave the column present-but-unbackfilled (the guard would then
    // skip the backfill on every later boot).
    await batch([
      "ALTER TABLE tasks ADD COLUMN assignee_ids TEXT NOT NULL DEFAULT '[]'",
      "UPDATE tasks SET assignee_ids = json_array(assignee_id) WHERE assignee_id IS NOT NULL AND assignee_id != ''",
    ]);
  } else if (!hasNewCol) {
    await execRaw("ALTER TABLE tasks ADD COLUMN assignee_ids TEXT NOT NULL DEFAULT '[]'");
  }

  // Migrate: per-user calendar feed token (#169 V1 — read-only .ics feed).
  // A high-entropy opaque token acts as a revocable secret URL (the Google/Apple
  // "secret iCal address" model). Stored two ways so a DB leak yields nothing
  // usable: the SHA-256 *hash* for the O(1) reverse lookup on the public feed
  // (one-way), and an AES-GCM *encryption* (same at-rest scheme as AI keys) so
  // Settings can re-display the stable URL. Both nullable; generated lazily.
  const userCols = await query<{ name: string }>("PRAGMA table_info(users)");
  if (!userCols.some((c) => c.name === "calendar_feed_token_hash")) {
    await execRaw("ALTER TABLE users ADD COLUMN calendar_feed_token_hash TEXT");
  }
  if (!userCols.some((c) => c.name === "calendar_feed_token_enc")) {
    await execRaw("ALTER TABLE users ADD COLUMN calendar_feed_token_enc TEXT");
  }
  await execRaw(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_feed_token_hash ON users(calendar_feed_token_hash) WHERE calendar_feed_token_hash IS NOT NULL"
  );

  // Migrate: add AI config columns to settings
  const settingsCols = await query<{ name: string }>("PRAGMA table_info(settings)");
  if (!settingsCols.some((c) => c.name === "ai_provider")) {
    // One atomic batch so a crash between ADDs can't half-apply the block and
    // leave the guard column present while the rest are missing (which would
    // make the guard skip the remainder forever → "no such column" at runtime).
    await batch([
      "ALTER TABLE settings ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'openai'",
      "ALTER TABLE settings ADD COLUMN ai_api_key TEXT",
      "ALTER TABLE settings ADD COLUMN ai_base_url TEXT",
      "ALTER TABLE settings ADD COLUMN ai_model TEXT",
    ]);
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

  // Refresh tokens: long-lived, single-use, rotated on each use. Only the
  // SHA-256 hash of the opaque token is stored — never the raw value — so a DB
  // leak cannot be replayed. `session_version` snapshots the user's version at
  // issue so a password change (which bumps it) invalidates refresh tokens too.
  // `revoked_at` marks rotated/revoked tokens; presenting one again is treated
  // as theft (the whole user's tokens are then revoked).
  await execRaw(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      token_hash      TEXT NOT NULL UNIQUE,
      session_version INTEGER NOT NULL DEFAULT 0,
      expires_at      TEXT NOT NULL,
      created_at      TEXT NOT NULL,
      revoked_at      TEXT
    )
  `);
  await execRaw("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash)");
  await execRaw("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)");
  await execRaw("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at)");

  // Prune long-expired refresh tokens (keep the table from growing unbounded).
  await execRaw("DELETE FROM refresh_tokens WHERE expires_at < datetime('now', '-7 days')");

  // Password reset tokens: short-lived, single-use. Like refresh tokens, only the
  // SHA-256 hash of the opaque token is stored, so a DB leak cannot be replayed.
  // `used_at` marks a consumed token; presenting it again is rejected.
  await execRaw(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      used_at    TEXT
    )
  `);
  await execRaw("CREATE INDEX IF NOT EXISTS idx_password_reset_hash ON password_reset_tokens(token_hash)");
  await execRaw("CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at)");
  await execRaw("CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id)");
  // Prune expired/old reset tokens (they are only valid for minutes).
  await execRaw("DELETE FROM password_reset_tokens WHERE expires_at < datetime('now', '-1 days')");

  // Email verification: a boolean on users + a single-use token table (same
  // hash-only-at-rest scheme as reset tokens). Verification is SOFT — a new
  // account is usable immediately, the flag just drives a "verify your email"
  // nudge. Existing accounts predate the feature, so on first add they are
  // backfilled to verified (1) — only NEW signups (inserted with 0) must confirm.
  const userColsEV = await query<{ name: string }>("PRAGMA table_info(users)");
  if (!userColsEV.some((c) => c.name === "email_verified")) {
    await execRaw("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
    await execRaw("UPDATE users SET email_verified = 1");
  }
  await execRaw(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      used_at    TEXT
    )
  `);
  await execRaw("CREATE INDEX IF NOT EXISTS idx_email_verify_hash ON email_verification_tokens(token_hash)");
  await execRaw("CREATE INDEX IF NOT EXISTS idx_email_verify_expires ON email_verification_tokens(expires_at)");
  await execRaw("CREATE INDEX IF NOT EXISTS idx_email_verify_user ON email_verification_tokens(user_id)");
  await execRaw("DELETE FROM email_verification_tokens WHERE expires_at < datetime('now', '-7 days')");

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
  if (!taskColsV3.some((c) => c.name === "remind_at")) {
    await execRaw("ALTER TABLE tasks ADD COLUMN remind_at TEXT");
  }
  if (!taskColsV3.some((c) => c.name === "scheduled_start")) {
    await execRaw("ALTER TABLE tasks ADD COLUMN scheduled_start TEXT");
  }

  // Migrate: free-form task tags (JSON array of strings).
  const taskColsV4 = await query<{ name: string }>("PRAGMA table_info(tasks)");
  if (!taskColsV4.some((c) => c.name === "tags_json")) {
    await execRaw("ALTER TABLE tasks ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'");
  }

  // Migrate: optional owning project (#211). Nullable FK-by-convention to
  // projects(id); unfiled tasks stay NULL. No DB-level FK so a project delete
  // never blocks/cascades tasks (handled at the app layer).
  const taskColsV5 = await query<{ name: string }>("PRAGMA table_info(tasks)");
  if (!taskColsV5.some((c) => c.name === "project_id")) {
    await execRaw("ALTER TABLE tasks ADD COLUMN project_id TEXT");
  }

  // Migrate: snapshot the owning project onto completed entries (#223) so a
  // project's real done/total can be counted. Nullable; historical entries
  // stay NULL (counted as 0 done until re-completed).
  const completedColsV2 = await query<{ name: string }>("PRAGMA table_info(completed_entries)");
  if (!completedColsV2.some((c) => c.name === "project_id")) {
    await execRaw("ALTER TABLE completed_entries ADD COLUMN project_id TEXT");
  }

  // Migrate: snapshot the task's tags onto completed entries (Tags V2) so the
  // Stats tag distribution can count finished work, not just active tasks (which
  // leave the cache once completed). Defaults to '[]'; historical entries carry
  // no tags (counted as untagged until re-completed).
  const completedColsV3 = await query<{ name: string }>("PRAGMA table_info(completed_entries)");
  if (!completedColsV3.some((c) => c.name === "tags_json")) {
    await execRaw("ALTER TABLE completed_entries ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'");
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
    // Atomic: both columns land together or neither (see the ai_provider block).
    await batch([
      "ALTER TABLE settings ADD COLUMN ai_cloud_used INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE settings ADD COLUMN ai_cloud_month TEXT NOT NULL DEFAULT ''",
    ]);
  }

  // Migrate: remote sync credentials per user
  const settingsColsV3 = await query<{ name: string }>("PRAGMA table_info(settings)");
  if (!settingsColsV3.some((c) => c.name === "remote_url")) {
    await batch([
      "ALTER TABLE settings ADD COLUMN remote_url TEXT",
      "ALTER TABLE settings ADD COLUMN remote_token TEXT",
    ]);
  }

  // Migrate: scheduled notification times
  const settingsColsV4 = await query<{ name: string }>("PRAGMA table_info(settings)");
  if (!settingsColsV4.some((c) => c.name === "morning_reminder_time")) {
    await batch([
      "ALTER TABLE settings ADD COLUMN morning_reminder_time TEXT NOT NULL DEFAULT '09:00'",
      "ALTER TABLE settings ADD COLUMN evening_reminder_time TEXT NOT NULL DEFAULT '18:00'",
    ]);
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

  // Reusable task templates (#173 V1). A lightweight per-user entity: a named
  // snapshot of a task's authored fields stored as a single JSON `payload` blob
  // (kept opaque here; validated by the contracts schema at the route). Created
  // with the full four-tuple { id, user_id, updated_at, deleted_at } so it is
  // syncable from day one with no follow-up ALTER. Idempotent.
  await execRaw(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'task',
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    )
  `);

  // Projects (#211 V1). A per-user container that groups tasks under goals: a
  // name, optional category + emoji/color cover, a JSON `goals_json` list of key
  // objectives, and a rich-text `content` document (TipTap JSON; inline-base64
  // images in V1). Created with the full four-tuple { id, user_id, updated_at,
  // deleted_at } so it is syncable from day one with no follow-up ALTER. Idempotent.
  await execRaw(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      category TEXT,
      color TEXT NOT NULL DEFAULT 'green',
      emoji TEXT,
      goals_json TEXT NOT NULL DEFAULT '[]',
      content TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    )
  `);

  // Migrate: pinned flag (#211 V2 ⭐6b) for existing projects tables. Additive,
  // idempotent; pinned projects sort to the top of the gallery.
  const projectCols = await query<{ name: string }>("PRAGMA table_info(projects)");
  if (!projectCols.some((c) => c.name === "pinned")) {
    await execRaw("ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  }

  // Migrate: per-user session version. Tokens embed the version they were minted
  // with; bumping it (on password change) invalidates all prior tokens.
  const userColsSV = await query<{ name: string }>("PRAGMA table_info(users)");
  if (!userColsSV.some((col) => col.name === "session_version")) {
    await execRaw("ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0");
  }

  // Migrate: countdown calendar system (#43). `date` always stores a solar
  // (Gregorian) ISO anchor; `calendar` records whether the user authored the
  // event in the solar or the Chinese lunar calendar (which only affects
  // display and yearly-recurrence math). Existing rows default to 'solar',
  // so behaviour is unchanged.
  const cdColsCal = await query<{ name: string }>("PRAGMA table_info(countdown_events)");
  if (!cdColsCal.some((col) => col.name === "calendar")) {
    await execRaw("ALTER TABLE countdown_events ADD COLUMN calendar TEXT NOT NULL DEFAULT 'solar'");
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

  // ── P1a sync: uniform four-tuple `updated_at` (ADR-0004 Addendum) ───────────
  // Every syncable entity must carry { id, user_id, updated_at, deleted_at }.
  // `tasks`, `habits`, `countdown_events` already have `updated_at`; `people`
  // and `completed_entries` do not — add them, seeding existing rows from the
  // most meaningful existing timestamp so they are not all-zero on first sync.
  //
  // NB: ALTER TABLE ADD COLUMN cannot use a non-constant DEFAULT, so we add the
  // column then backfill via UPDATE. Idempotent: guarded by PRAGMA, and the
  // backfill only touches NULLs.
  {
    const peopleCols = await query<{ name: string }>("PRAGMA table_info(people)");
    if (!peopleCols.some((c) => c.name === "updated_at")) {
      await execRaw("ALTER TABLE people ADD COLUMN updated_at TEXT");
      await execRaw("UPDATE people SET updated_at = created_at WHERE updated_at IS NULL");
    }
    const completedCols = await query<{ name: string }>("PRAGMA table_info(completed_entries)");
    if (!completedCols.some((c) => c.name === "updated_at")) {
      await execRaw("ALTER TABLE completed_entries ADD COLUMN updated_at TEXT");
      await execRaw("UPDATE completed_entries SET updated_at = completed_at WHERE updated_at IS NULL");
    }
  }

  // Normalize ALL existing `updated_at` values across syncable tables to the
  // canonical HLC shape: ISO-8601 UTC with SIX fractional-second digits + 'Z',
  // e.g. `2026-06-26T10:00:00.000000Z`. The LWW engine and pull cursor do a raw
  // STRING compare on `updated_at`, so mixing shapes silently mis-orders rows:
  //   - a SQLite datetime ("2026-06-26 10:00:00") sorts the space (0x20) before
  //     a 'T' (0x54), so it always looks "older" and gets clobbered;
  //   - a 3-fractional-digit ISO ("…326Z", old `toISOString()` writes) sorts
  //     before the 6-digit HLC values that synced rows carry.
  // Two legacy shapes therefore get converted; values already in the canonical
  // 6-digit form are left untouched, so re-runs are exact no-ops (idempotent).
  for (const table of ["tasks", "people", "completed_entries", "habits", "countdown_events"]) {
    // (a) SQLite datetime space-form `YYYY-MM-DD HH:MM:SS` (exactly 19 chars, 11th
    //     char is a space) → `YYYY-MM-DDTHH:MM:SS.000000Z`. The `LENGTH = 19` guard
    //     ensures a space-form value that somehow carried a trailing fraction is
    //     NOT double-appended into a malformed `…SS.mmm.000000Z`.
    await execRaw(
      `UPDATE ${table}
         SET updated_at = REPLACE(updated_at, ' ', 'T') || '.000000Z'
       WHERE updated_at IS NOT NULL
         AND LENGTH(updated_at) = 19
         AND SUBSTR(updated_at, 11, 1) = ' '`
    );
    // (b) 3-fractional-digit ISO `…SS.mmmZ` (length 24, ends in 'Z', a '.' at the
    //     20th char) → pad the fractional part to 6 digits: `…SS.mmm000Z`. This
    //     matches ONLY the 3-digit form; the canonical 6-digit form has length 27
    //     so it is excluded and left untouched.
    await execRaw(
      `UPDATE ${table}
         SET updated_at = SUBSTR(updated_at, 1, 23) || '000Z'
       WHERE updated_at IS NOT NULL
         AND LENGTH(updated_at) = 24
         AND SUBSTR(updated_at, 24, 1) = 'Z'
         AND SUBSTR(updated_at, 20, 1) = '.'`
    );
    // Any remaining NULL updated_at (shouldn't happen on the four-tuple tables,
    // but defensive) gets a value STRICTLY GREATER than MIN_HLC. It must NOT be
    // MIN_HLC itself: pull filters `updated_at > :since` with `since` defaulting
    // to MIN_HLC on a full sync, so a row exactly equal to MIN_HLC would never be
    // returned. `…000001Z` is the smallest value that still pulls on a full sync.
    await execRaw(
      `UPDATE ${table} SET updated_at = '1970-01-01T00:00:00.000001Z' WHERE updated_at IS NULL`
    );
  }

  // Sync read indexes: pull does `WHERE user_id = ? AND updated_at > ? ORDER BY
  // updated_at`, so a composite (user_id, updated_at) lets it run as an index
  // range scan with the ordering already satisfied. NOT partial on deleted_at —
  // pull intentionally returns tombstoned rows so deletes propagate.
  await execRaw(`
    CREATE INDEX IF NOT EXISTS idx_tasks_user_updated ON tasks(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_people_user_updated ON people(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_completed_user_updated ON completed_entries(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_habits_user_updated ON habits(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_countdowns_user_updated ON countdown_events(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_templates_user_updated ON templates(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at);
  `);

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
    CREATE INDEX IF NOT EXISTS idx_tasks_user_project ON tasks(user_id, project_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_completed_user_completedat ON completed_entries(user_id, completed_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_people_user_created ON people(user_id, created_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_habits_user_created ON habits(user_id, created_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date ON habit_logs(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_countdowns_user_created ON countdown_events(user_id, created_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_templates_user_created ON templates(user_id, created_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_projects_user_created ON projects(user_id, created_at) WHERE deleted_at IS NULL;
  `);

  // ── Drop dead ADR-0003 sync machinery (P3) ──────────────────────────────────
  // The current HLC-based sync (ADR-0004, P1) keys exclusively on `updated_at`
  // and never reads `seq`, `sync_seq`, `sync_cursors`, or `idempotency_keys`.
  // These were ADR-0003 leftovers with no production reader, so they are dropped
  // here. This block runs unconditionally each boot but is a cheap no-op once
  // already clean (DROP … IF EXISTS, plus a PRAGMA guard before DROP COLUMN).
  //
  // Ordering is load-bearing: the seq triggers and (user_id, seq) index reference
  // the `seq` column, so they MUST be dropped BEFORE the column. `sync_seq` is
  // dropped after, since the triggers' bodies reference it. Each DROP is a single
  // statement (execRaw splits on ';'), so they run one at a time.
  for (const table of ["tasks", "completed_entries", "people", "habits", "countdown_events"]) {
    await execRaw(`DROP TRIGGER IF EXISTS trg_${table}_seq_insert`);
    await execRaw(`DROP TRIGGER IF EXISTS trg_${table}_seq_update`);
    await execRaw(`DROP INDEX IF EXISTS idx_${table}_user_seq`);
    // DROP COLUMN only if the column still exists (libsql/SQLite 3.35+ supports
    // ALTER TABLE … DROP COLUMN). Guarded via PRAGMA so a re-run is a no-op.
    const cols = await query<{ name: string }>(`PRAGMA table_info(${table})`);
    if (cols.some((col) => col.name === "seq")) {
      await execRaw(`ALTER TABLE ${table} DROP COLUMN seq`);
    }
  }
  await execRaw("DROP TABLE IF EXISTS sync_seq");
  await execRaw("DROP TABLE IF EXISTS sync_cursors");
  await execRaw("DROP TABLE IF EXISTS idempotency_keys");

  // ── P1b desktop sync client binding/cursor state (ADR-0004 Addendum) ────────
  // The LOCAL backend's sync client persists, per local user, whether sync is
  // enabled, which cloud it is bound to, the (encrypted) cloud JWT, and the two
  // HLC high-watermark cursors. Cursors default to MIN_HLC so a fresh enable
  // does a full two-way reconcile. `cloud_token` is stored via encryptSecret.
  // Idempotent: CREATE TABLE IF NOT EXISTS only.
  await execRaw(`
    CREATE TABLE IF NOT EXISTS sync_client_state (
      user_id        TEXT PRIMARY KEY REFERENCES users(id),
      enabled        INTEGER NOT NULL DEFAULT 0,
      cloud_base     TEXT,
      cloud_token    TEXT,
      push_cursor    TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000000Z',
      pull_cursor    TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000000Z',
      last_synced_at TEXT,
      last_error     TEXT
    )
  `);

  // ── Username-first auth (#17) + recovery codes (#16) ─────────────────────────
  // The login identity moves from email to a unique, case-insensitive username;
  // email becomes OPTIONAL (bound after registration, used only for recovery +
  // notifications). Recovery codes are the universal offline password-reset
  // fallback, stored hashed and single-use.
  //
  // Three parts, each idempotent:
  //   (a) add username / username_lower columns + a partial-unique index;
  //   (b) backfill legacy (email-only) accounts with a username derived from the
  //       email local-part, de-duplicating collisions with a numeric suffix;
  //   (c) a GUARDED table-rebuild that drops the NOT NULL on `email` (SQLite can't
  //       ALTER a NOT NULL away) — runs ONCE, only while the live schema still has
  //       email NOT NULL, and preserves every existing column + row.
  {
    const uCols = await query<{ name: string; notnull: number }>("PRAGMA table_info(users)");
    if (!uCols.some((c) => c.name === "username")) {
      await execRaw("ALTER TABLE users ADD COLUMN username TEXT");
    }
    if (!uCols.some((c) => c.name === "username_lower")) {
      await execRaw("ALTER TABLE users ADD COLUMN username_lower TEXT");
    }

    // (b) Backfill legacy accounts. New signups always insert a username, so this
    // only ever touches pre-#17 rows; on a fresh DB it is a no-op.
    const needing = await query<{ id: string; email: string | null }>(
      "SELECT id, email FROM users WHERE username_lower IS NULL",
    );
    if (needing.length > 0) {
      const takenRows = await query<{ username_lower: string }>(
        "SELECT username_lower FROM users WHERE username_lower IS NOT NULL",
      );
      const taken = new Set(takenRows.map((r) => r.username_lower));
      for (const u of needing) {
        let base = (u.email ?? "user").split("@")[0].toLowerCase().replace(/[^a-z0-9_-]/g, "");
        base = base.replace(/^[-_]+/, "").replace(/[-_]+$/, "");
        if (base.length < 3) base = `user${base}`;
        base = base.slice(0, 32).replace(/[-_]+$/, "") || "user";
        let candidate = base;
        let n = 1;
        while (taken.has(candidate)) {
          const suffix = String(n++);
          candidate = (base.slice(0, 32 - suffix.length) + suffix);
        }
        taken.add(candidate);
        await execute(
          "UPDATE users SET username = :u, username_lower = :ul WHERE id = :id",
          { u: candidate, ul: candidate, id: u.id },
        );
      }
    }

    // (c) Guarded rebuild — only while `email` is still NOT NULL. The `users`
    // table is the FK target of tasks/settings/people/… , and libsql enables
    // `PRAGMA foreign_keys` by DEFAULT (unlike better-sqlite3), so the rebuild's
    // `DROP TABLE users` — which performs an implicit row-delete — would trip
    // "FOREIGN KEY constraint failed" on any DB that already has child rows
    // (the Windows desktop boot failure). Suspend FK enforcement for the
    // rebuild, then restore it. The toggle MUST live outside the batch: a
    // `PRAGMA foreign_keys` issued inside a transaction is a silent no-op, and
    // `batch(...)` wraps its statements in BEGIN…COMMIT. The `finally` restores
    // enforcement even if the rebuild throws, so a failure never leaks FK OFF.
    const emailCol = uCols.find((c) => c.name === "email");
    if (emailCol && emailCol.notnull === 1) {
      await execRaw("PRAGMA foreign_keys = OFF");
      try {
      // Table rebuild (SQLite can't relax a NOT NULL in place). Run the whole
      // create→copy→drop→rename as ONE atomic batch (BEGIN…COMMIT) so a crash
      // mid-rebuild rolls back completely instead of leaving an orphaned
      // `users_new` while the guard above stays true — which previously bricked
      // every subsequent boot with "table users_new already exists". The leading
      // DROP … IF EXISTS also self-heals any orphan left by the old, non-atomic
      // code so already-broken deployments recover on the next boot.
      await batch([
        "DROP TABLE IF EXISTS users_new",
        `CREATE TABLE users_new (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          initials TEXT NOT NULL,
          local INTEGER NOT NULL DEFAULT 0,
          plan TEXT DEFAULT 'free',
          renews_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          calendar_feed_token_hash TEXT,
          calendar_feed_token_enc TEXT,
          email_verified INTEGER NOT NULL DEFAULT 0,
          session_version INTEGER NOT NULL DEFAULT 0,
          username TEXT,
          username_lower TEXT
        )`,
        `INSERT INTO users_new
          (id, email, password_hash, name, initials, local, plan, renews_at, created_at,
           calendar_feed_token_hash, calendar_feed_token_enc, email_verified, session_version,
           username, username_lower)
        SELECT
           id, email, password_hash, name, initials, local, plan, renews_at, created_at,
           calendar_feed_token_hash, calendar_feed_token_enc, email_verified, session_version,
           username, username_lower
        FROM users`,
        "DROP TABLE users",
        "ALTER TABLE users_new RENAME TO users",
        // The rebuild dropped the calendar-feed unique index with the old table;
        // recreate it inside the same transaction so it exists within this boot.
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_feed_token_hash ON users(calendar_feed_token_hash) WHERE calendar_feed_token_hash IS NOT NULL",
      ]);
      } finally {
        await execRaw("PRAGMA foreign_keys = ON");
      }
    }

    // (a·2) Partial-unique index on the case-insensitive handle. Created after the
    // backfill + rebuild so it never trips on transient duplicates.
    await execRaw(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users(username_lower) WHERE username_lower IS NOT NULL",
    );
  }

  // Recovery codes: one active, single-use offline password-recovery code per
  // user. Stored HASHED only (same argon2/bcrypt scheme as password_hash), issued
  // once at registration and regenerable from the account page (regenerate
  // replaces the active one). `used_at` marks a consumed code; regeneration
  // simply deletes the prior row so at most one active code exists per user.
  await execRaw(`
    CREATE TABLE IF NOT EXISTS recovery_codes (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      code_hash  TEXT NOT NULL,
      created_at TEXT NOT NULL,
      used_at    TEXT
    )
  `);
  await execRaw("CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON recovery_codes(user_id)");

  // ── GitHub OAuth login (#15) ─────────────────────────────────────────────────
  // A GitHub identity maps to exactly one Lumo account. Only `github_user_id`
  // (GitHub's stable numeric id, as text) is persisted — never a GitHub access
  // token, which is used transiently to fetch the profile and then discarded.
  // The partial-unique index enforces one-account-per-identity while leaving
  // NULLs (accounts with no GitHub link) unconstrained. Idempotent.
  const ghUserCols = await query<{ name: string }>("PRAGMA table_info(users)");
  if (!ghUserCols.some((c) => c.name === "github_user_id")) {
    await execRaw("ALTER TABLE users ADD COLUMN github_user_id TEXT");
  }
  await execRaw(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_user_id ON users(github_user_id) WHERE github_user_id IS NOT NULL",
  );

  // Short-lived, single-use CSRF `state` store for the authorize→callback round
  // trip. A state is minted at /github/start and consumed exactly once at
  // /github/callback (validated + marked used); anything unknown/expired/used is
  // rejected. Pruned on each boot. Idempotent.
  await execRaw(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state      TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      used_at    TEXT
    )
  `);
  await execRaw("CREATE INDEX IF NOT EXISTS idx_oauth_states_created ON oauth_states(created_at)");
  // States are only valid for minutes; drop anything older than a day.
  await execRaw("DELETE FROM oauth_states WHERE created_at < datetime('now', '-1 days')");

  // One-time session-handoff store: the callback mints a random `code` that maps
  // to freshly-issued Lumo tokens, and the SPA exchanges that code (once) for the
  // session — so tokens are NEVER placed in a redirect URL/history. Single-use +
  // short-lived. Pruned on each boot. Idempotent.
  await execRaw(`
    CREATE TABLE IF NOT EXISTS oauth_handoffs (
      code          TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      token         TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      used_at       TEXT
    )
  `);
  await execRaw("CREATE INDEX IF NOT EXISTS idx_oauth_handoffs_created ON oauth_handoffs(created_at)");
  await execRaw("DELETE FROM oauth_handoffs WHERE created_at < datetime('now', '-1 days')");

  // ── In-app feedback (#473 follow-up) ─────────────────────────────────────────
  // Any signed-in user can submit feedback; an operator (email in
  // LUMO_ADMIN_EMAILS) reviews all of it, moves each item through a status, and
  // writes a reply the submitter sees. NOT a syncable domain — feedback lives
  // server-side only (no per-device copy), so no four-tuple/tombstone columns.
  await execRaw(`
    CREATE TABLE IF NOT EXISTS feedback (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      message    TEXT NOT NULL,
      category   TEXT NOT NULL DEFAULT 'other',
      status     TEXT NOT NULL DEFAULT 'open',
      response   TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  // A user's own list filters by user_id (newest first); the admin queue lists
  // everything newest first. Index both hot paths.
  await execRaw("CREATE INDEX IF NOT EXISTS idx_feedback_user_created ON feedback(user_id, created_at)");
  await execRaw("CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at)");

  // Global monthly counter for the shared Lumo Cloud AI key. Guards the account
  // owner's provider bill: without an aggregate ceiling, a burst of signups runs
  // straight against the shared LUMO_AI_KEY (only per-user 100/mo caps existed).
  // One row per YYYY-MM month; incremented atomically alongside per-user usage.
  await execRaw(`
    CREATE TABLE IF NOT EXISTS ai_cloud_global (
      month TEXT PRIMARY KEY,
      used  INTEGER NOT NULL DEFAULT 0
    )
  `);
}

// When run directly as a script
if (process.argv[1]?.endsWith("migrate.ts") || process.argv[1]?.endsWith("migrate.js")) {
  runMigrations()
    .then(() => { console.log("Migrations complete."); process.exit(0); })
    .catch((err) => { console.error(err); process.exit(1); });
}
