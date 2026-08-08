/**
 * Password reset tokens — short-lived, single-use.
 *
 * The raw token is an opaque 256-bit random string embedded in the reset link;
 * the DB stores only its SHA-256 hash, so a database leak cannot be replayed.
 * A token is valid for a short window and exactly once: consuming it marks
 * `used_at`, and any later presentation is rejected. Mirrors the refresh-token
 * at-rest scheme (hash-only storage) but with a much shorter TTL.
 */
import { randomBytes, createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { queryOne, execute } from "../db/client.js";

const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface ResetRow {
  id: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint a reset token for a user, persisting only its hash. Returns the raw token. */
export async function issueResetToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const now = Date.now();
  await execute(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES (:id, :uid, :hash, :exp, :now)`,
    {
      id: "prt_" + nanoid(12),
      uid: userId,
      hash: hashToken(raw),
      exp: new Date(now + RESET_TTL_MS).toISOString(),
      now: new Date(now).toISOString(),
    },
  );
  return raw;
}

/**
 * Validate and consume a reset token. Returns the owning userId on success, or
 * null if the token is unknown, expired, or already used. Marks the token used
 * atomically-enough for our single-writer DB (guarded by `used_at IS NULL`).
 */
export async function consumeResetToken(raw: string): Promise<string | null> {
  const row = await queryOne<ResetRow>(
    "SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = :hash",
    { hash: hashToken(raw) },
  );
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  const res = await execute(
    "UPDATE password_reset_tokens SET used_at = :now WHERE id = :id AND used_at IS NULL",
    { now: new Date().toISOString(), id: row.id },
  );
  // If another request consumed it first, the guard makes this a no-op → reject.
  if (res.changes === 0) return null;
  return row.user_id;
}
