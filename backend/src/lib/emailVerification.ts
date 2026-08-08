/**
 * Email verification tokens — single-use, longer-lived than a password reset.
 *
 * Same at-rest scheme as refresh/reset tokens: the raw token is an opaque
 * 256-bit random string embedded in the verification link; the DB stores only
 * its SHA-256 hash. Consuming a token marks `used_at`; later presentation is
 * rejected. Valid for 24 hours (a confirmation link people may open next day).
 */
import { randomBytes, createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { queryOne, execute } from "../db/client.js";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface VerifyRow {
  id: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint a verification token for a user, persisting only its hash. */
export async function issueVerificationToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const now = Date.now();
  await execute(
    `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES (:id, :uid, :hash, :exp, :now)`,
    {
      id: "evt_" + nanoid(12),
      uid: userId,
      hash: hashToken(raw),
      exp: new Date(now + VERIFY_TTL_MS).toISOString(),
      now: new Date(now).toISOString(),
    },
  );
  return raw;
}

/**
 * Validate and consume a verification token. Returns the owning userId on
 * success, or null if the token is unknown, expired, or already used. Guarded by
 * `used_at IS NULL` so a concurrent double-submit consumes it exactly once.
 */
export async function consumeVerificationToken(raw: string): Promise<string | null> {
  const row = await queryOne<VerifyRow>(
    "SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = :hash",
    { hash: hashToken(raw) },
  );
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  const res = await execute(
    "UPDATE email_verification_tokens SET used_at = :now WHERE id = :id AND used_at IS NULL",
    { now: new Date().toISOString(), id: row.id },
  );
  if (res.changes === 0) return null;
  return row.user_id;
}
