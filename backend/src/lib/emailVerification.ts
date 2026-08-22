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
 * Why a token failed to verify — logged server-side (never shown to the client)
 * so a live "invalid link" can be diagnosed without guessing:
 *   • unknown — no row for this token hash: wrong/garbled token, or it was
 *     deleted by a later bind-email/resend, or minted against a different DB.
 *   • expired — the row exists but is past its 24h TTL.
 *   • used    — the row was already consumed (an earlier click, or a link-preview
 *     bot / browser prefetch that touched the single-use link first).
 */
export type VerifyFailReason = "unknown" | "expired" | "used";
export type VerifyResult = { ok: true; userId: string } | { ok: false; reason: VerifyFailReason };

/**
 * Validate and consume a verification token. On success returns the owning
 * userId; on failure returns a reason (for server-side logging only). Guarded by
 * `used_at IS NULL` so a concurrent double-submit consumes it exactly once.
 */
export async function consumeVerificationToken(raw: string): Promise<VerifyResult> {
  const row = await queryOne<VerifyRow>(
    "SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = :hash",
    { hash: hashToken(raw) },
  );
  if (!row) return { ok: false, reason: "unknown" };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (row.used_at) return { ok: false, reason: "used" };

  const res = await execute(
    "UPDATE email_verification_tokens SET used_at = :now WHERE id = :id AND used_at IS NULL",
    { now: new Date().toISOString(), id: row.id },
  );
  if (res.changes === 0) return { ok: false, reason: "used" };
  return { ok: true, userId: row.user_id };
}
