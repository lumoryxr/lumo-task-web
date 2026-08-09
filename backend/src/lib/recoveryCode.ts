/**
 * Recovery codes — the universal, offline password-recovery fallback (#16).
 *
 * A recovery code is issued ONCE at registration (and regenerable from the
 * account page); it is the channel that always works, even for an account with
 * no email bound. Format: `LUMO-XXXX-XXXX-XXXX-XXXX` — 16 Crockford-base32
 * characters (~80 bits of entropy) in four dash-separated groups.
 *
 * At-rest scheme mirrors the login password: only the argon2/bcrypt HASH is
 * stored (via `hashPassword`), never the plaintext, so a DB leak yields nothing
 * usable. The plaintext is returned to the caller exactly once (registration /
 * regenerate) and NEVER logged or returned by any GET. Single-use: consuming a
 * code to reset a password marks it used. At most one active code per user —
 * issuing a new one deletes any prior code (regenerate = invalidate old).
 */
import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { queryOne, execute } from "../db/client.js";
import { hashPassword, verifyPassword, dummyVerify } from "./password.js";

// Crockford base32 — excludes I, L, O, U to avoid transcription ambiguity.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GROUPS = 4;
const CHARS_PER_GROUP = 4;

interface RecoveryRow {
  id: string;
  user_id: string;
  code_hash: string;
  used_at: string | null;
}

/** Generate a fresh `LUMO-XXXX-XXXX-XXXX-XXXX` plaintext code. */
function generatePlaintext(): string {
  const total = GROUPS * CHARS_PER_GROUP;
  // byte & 0x1f is uniform over 0..31 → no modulo bias against the 32-char set.
  const bytes = randomBytes(total);
  let out = "";
  for (let i = 0; i < total; i++) out += ALPHABET[bytes[i] & 0x1f];
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    groups.push(out.slice(g * CHARS_PER_GROUP, (g + 1) * CHARS_PER_GROUP));
  }
  return `LUMO-${groups.join("-")}`;
}

/**
 * Canonicalize user-typed input to the exact form that was hashed: uppercase,
 * strip everything but base32 chars, then re-frame as `LUMO-XXXX-…`. This makes
 * verification tolerant of lost dashes, added spaces, or lowercase — while still
 * hashing/comparing a single canonical string. Crockford look-alikes are folded
 * (I/L→1, O→0). Returns null if the payload isn't 16 base32 chars.
 */
function canonicalize(raw: string): string | null {
  // Drop the LUMO prefix FIRST (it contains L/O, which the fold below rewrites).
  let s = raw.toUpperCase().trim().replace(/^LUMO/, "");
  // Fold Crockford look-alikes on the payload, then keep only alphabet chars
  // (this also strips the dashes / spaces / any stray separators).
  s = s.replace(/[ILO]/g, (ch) => (ch === "O" ? "0" : "1"));
  s = s.replace(new RegExp(`[^${ALPHABET}]`, "g"), "");
  if (s.length !== GROUPS * CHARS_PER_GROUP) return null;
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    groups.push(s.slice(g * CHARS_PER_GROUP, (g + 1) * CHARS_PER_GROUP));
  }
  return `LUMO-${groups.join("-")}`;
}

/**
 * Issue a recovery code for `userId`, replacing any existing one. Persists only
 * the hash; returns the one-time plaintext for the caller to surface once.
 */
export async function issueRecoveryCode(userId: string): Promise<string> {
  const plaintext = generatePlaintext();
  const code_hash = await hashPassword(plaintext);
  // Regenerate = invalidate old: at most one active code per user.
  await execute("DELETE FROM recovery_codes WHERE user_id = :uid", { uid: userId });
  await execute(
    `INSERT INTO recovery_codes (id, user_id, code_hash, created_at)
     VALUES (:id, :uid, :hash, :now)`,
    { id: "rc_" + nanoid(12), uid: userId, hash: code_hash, now: new Date().toISOString() },
  );
  return plaintext;
}

/**
 * Verify a `(username, code)` pair and, on success, consume the code (single
 * use) and return the owning userId. Returns null on any failure — unknown
 * username, no active code, wrong/used code. Constant-time-ish: a bcrypt compare
 * (real or dummy) always runs so neither an unknown username nor a missing code
 * is distinguishable by latency, and the response is non-enumerable.
 */
export async function verifyAndConsumeRecoveryCode(
  username: string,
  code: string,
): Promise<string | null> {
  const canonical = canonicalize(code);
  const usernameLower = username.trim().toLowerCase();

  const user = usernameLower
    ? await queryOne<{ id: string }>(
        "SELECT id FROM users WHERE username_lower = :ul",
        { ul: usernameLower },
      )
    : undefined;

  const row =
    user && canonical
      ? await queryOne<RecoveryRow>(
          "SELECT id, user_id, code_hash, used_at FROM recovery_codes WHERE user_id = :uid AND used_at IS NULL",
          { uid: user.id },
        )
      : undefined;

  if (!row || !canonical) {
    // Spend equivalent bcrypt time so the miss path can't be timed apart.
    await dummyVerify(canonical ?? code);
    return null;
  }

  const ok = await verifyPassword(canonical, row.code_hash);
  if (!ok) return null;

  // Single-use: mark consumed, guarded so a concurrent double-submit consumes
  // it exactly once.
  const res = await execute(
    "UPDATE recovery_codes SET used_at = :now WHERE id = :id AND used_at IS NULL",
    { now: new Date().toISOString(), id: row.id },
  );
  if (res.changes === 0) return null;
  return row.user_id;
}
