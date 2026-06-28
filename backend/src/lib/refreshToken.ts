/**
 * Refresh tokens — long-lived, single-use, rotated on every use.
 *
 * The raw token is an opaque 256-bit random string handed to the client; the DB
 * stores only its SHA-256 hash, so a database leak cannot be replayed. Each use
 * rotates the token (the old one is revoked, a fresh one issued). Presenting an
 * already-revoked token is treated as theft: every refresh token for that user
 * is revoked, forcing re-authentication.
 *
 * A refresh token snapshots the user's `session_version` at issue; a password
 * change bumps that version and so invalidates outstanding refresh tokens too.
 */
import { randomBytes, createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { query, queryOne, execute } from "../db/client.js";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface RefreshRow {
  id: string;
  user_id: string;
  token_hash: string;
  session_version: number;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint a new opaque refresh token for a user, persisting only its hash. */
export async function issueRefreshToken(userId: string, sessionVersion: number): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const now = Date.now();
  await execute(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, session_version, expires_at, created_at)
     VALUES (:id, :uid, :hash, :sv, :exp, :now)`,
    {
      id: "rt_" + nanoid(12),
      uid: userId,
      hash: hashToken(raw),
      sv: sessionVersion,
      exp: new Date(now + REFRESH_TTL_MS).toISOString(),
      now: new Date(now).toISOString(),
    },
  );
  return raw;
}

/** Revoke every refresh token for a user (theft response / full sign-out). */
export async function revokeAllForUser(userId: string): Promise<void> {
  await execute(
    "UPDATE refresh_tokens SET revoked_at = :now WHERE user_id = :uid AND revoked_at IS NULL",
    { now: new Date().toISOString(), uid: userId },
  );
}

/** Revoke a single refresh token (best-effort; unknown tokens are a no-op). */
export async function revokeRefreshToken(raw: string): Promise<void> {
  await execute(
    "UPDATE refresh_tokens SET revoked_at = :now WHERE token_hash = :hash AND revoked_at IS NULL",
    { now: new Date().toISOString(), hash: hashToken(raw) },
  );
}

export interface RotateResult {
  token: string; // the new raw refresh token
  userId: string;
  sessionVersion: number; // the user's CURRENT session version
}

/**
 * Validate and rotate a refresh token. Returns the new token + identity on
 * success, or null if the token is unknown, expired, stale (password changed),
 * or reused. A reuse (already-revoked token presented again) revokes the whole
 * user's token family.
 */
export async function rotateRefreshToken(raw: string): Promise<RotateResult | null> {
  const row = await queryOne<RefreshRow>(
    "SELECT * FROM refresh_tokens WHERE token_hash = :hash",
    { hash: hashToken(raw) },
  );
  if (!row) return null;

  // Reuse detection: a revoked token presented again means the token was
  // captured and replayed. Revoke the entire family and refuse.
  if (row.revoked_at) {
    await revokeAllForUser(row.user_id);
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  const user = await queryOne<{ session_version: number }>(
    "SELECT session_version FROM users WHERE id = :uid",
    { uid: row.user_id },
  );
  if (!user) return null;
  // Password change (or other forced logout) bumped the version past this token.
  if (row.session_version < user.session_version) return null;

  // Rotate: revoke the presented token, issue a fresh one at the current version.
  await execute(
    "UPDATE refresh_tokens SET revoked_at = :now WHERE id = :id",
    { now: new Date().toISOString(), id: row.id },
  );
  const token = await issueRefreshToken(row.user_id, user.session_version);
  return { token, userId: row.user_id, sessionVersion: user.session_version };
}

/** Test/maintenance helper: count a user's live (unrevoked, unexpired) tokens. */
export async function countLiveTokens(userId: string): Promise<number> {
  const rows = await query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM refresh_tokens WHERE user_id = :uid AND revoked_at IS NULL AND expires_at > :now",
    { uid: userId, now: new Date().toISOString() },
  );
  return rows[0]?.n ?? 0;
}
