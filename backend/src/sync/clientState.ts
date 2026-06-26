/**
 * Sync-client binding/cursor state (ADR-0004 Addendum, 2026-06-26; P1b-core FR1).
 *
 * Per-local-user persistence for the desktop sync client: enabled flag, the
 * bound cloud base URL, the (ENCRYPTED) cloud JWT, and the two HLC cursors plus
 * last-synced/last-error. The `cloud_token` column always holds ciphertext from
 * `encryptSecret`; callers decrypt explicitly via `getDecryptedToken`. The token
 * is NEVER returned by the plain `getState`/status path.
 */
import { execute, queryOne, query } from "../db/client.js";
import { MIN_HLC } from "../lib/hlc.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";

export interface SyncClientState {
  userId: string;
  enabled: boolean;
  cloudBase: string | null;
  /** Raw stored value (ciphertext). Callers must not surface this. */
  cloudTokenEncrypted: string | null;
  pushCursor: string;
  pullCursor: string;
  lastSyncedAt: string | null;
  lastError: string | null;
}

interface StateRow {
  user_id: string;
  enabled: number;
  cloud_base: string | null;
  cloud_token: string | null;
  push_cursor: string;
  pull_cursor: string;
  last_synced_at: string | null;
  last_error: string | null;
}

function mapRow(r: StateRow): SyncClientState {
  return {
    userId: r.user_id,
    enabled: Boolean(r.enabled),
    cloudBase: r.cloud_base ?? null,
    cloudTokenEncrypted: r.cloud_token ?? null,
    pushCursor: r.push_cursor ?? MIN_HLC,
    pullCursor: r.pull_cursor ?? MIN_HLC,
    lastSyncedAt: r.last_synced_at ?? null,
    lastError: r.last_error ?? null,
  };
}

/** The disabled/default state for a user with no row yet. */
function defaultState(userId: string): SyncClientState {
  return {
    userId,
    enabled: false,
    cloudBase: null,
    cloudTokenEncrypted: null,
    pushCursor: MIN_HLC,
    pullCursor: MIN_HLC,
    lastSyncedAt: null,
    lastError: null,
  };
}

/** Read the binding state for a user (defaults if no row exists). */
export async function getState(userId: string): Promise<SyncClientState> {
  const row = await queryOne<StateRow>(
    "SELECT * FROM sync_client_state WHERE user_id = :uid",
    { uid: userId },
  );
  return row ? mapRow(row) : defaultState(userId);
}

/** Decrypt and return the stored cloud token, or null if not bound. */
export async function getDecryptedToken(userId: string): Promise<string | null> {
  const row = await queryOne<{ cloud_token: string | null }>(
    "SELECT cloud_token FROM sync_client_state WHERE user_id = :uid",
    { uid: userId },
  );
  if (!row?.cloud_token) return null;
  return decryptSecret(row.cloud_token);
}

/**
 * Bind/enable: upsert enabled=1 with the cloud base + ENCRYPTED token and reset
 * both cursors to MIN_HLC (so first enable runs a full two-way reconcile). Any
 * prior last_error is cleared.
 */
export async function bind(
  userId: string,
  cloudBase: string,
  token: string,
): Promise<void> {
  const enc = encryptSecret(token);
  await execute(
    `INSERT INTO sync_client_state
       (user_id, enabled, cloud_base, cloud_token, push_cursor, pull_cursor, last_error)
     VALUES (:uid, 1, :base, :tok, :min, :min, NULL)
     ON CONFLICT(user_id) DO UPDATE SET
       enabled = 1,
       cloud_base = excluded.cloud_base,
       cloud_token = excluded.cloud_token,
       push_cursor = :min,
       pull_cursor = :min,
       last_error = NULL`,
    { uid: userId, base: cloudBase, tok: enc, min: MIN_HLC },
  );
}

/** Disable: enabled=0, clear the token + last_error. Cursors and data untouched. */
export async function unbind(userId: string): Promise<void> {
  await execute(
    `INSERT INTO sync_client_state (user_id, enabled, cloud_token, last_error)
       VALUES (:uid, 0, NULL, NULL)
     ON CONFLICT(user_id) DO UPDATE SET
       enabled = 0, cloud_token = NULL, last_error = NULL`,
    { uid: userId },
  );
}

/**
 * Persist advanced cursors + a successful sync timestamp; clears last_error.
 * Upserts so a cycle that runs before any binding row exists (e.g. a unit test
 * driving runSyncCycle directly) still persists state rather than silently
 * UPDATE-ing zero rows.
 */
export async function recordSuccess(
  userId: string,
  pushCursor: string,
  pullCursor: string,
  syncedAt: string,
): Promise<void> {
  await execute(
    `INSERT INTO sync_client_state
       (user_id, push_cursor, pull_cursor, last_synced_at, last_error)
     VALUES (:uid, :push, :pull, :at, NULL)
     ON CONFLICT(user_id) DO UPDATE SET
       push_cursor = excluded.push_cursor,
       pull_cursor = excluded.pull_cursor,
       last_synced_at = excluded.last_synced_at,
       last_error = NULL`,
    { uid: userId, push: pushCursor, pull: pullCursor, at: syncedAt },
  );
}

/**
 * Record a cycle failure WITHOUT advancing cursors (safe retry). Upserts so the
 * error is persisted even if no binding row exists yet; cursors fall to their
 * column defaults (MIN_HLC) on insert, which is exactly the pre-cycle value.
 */
export async function recordError(userId: string, message: string): Promise<void> {
  await execute(
    `INSERT INTO sync_client_state (user_id, last_error)
       VALUES (:uid, :err)
     ON CONFLICT(user_id) DO UPDATE SET last_error = :err`,
    { uid: userId, err: message },
  );
}

/** All user_ids with sync currently enabled (for the background loop). */
export async function listEnabledUsers(): Promise<string[]> {
  const rows = await query<{ user_id: string }>(
    "SELECT user_id FROM sync_client_state WHERE enabled = 1",
  );
  return rows.map((r) => r.user_id);
}
