import { Hono } from "hono";
import { validate } from "../lib/validate.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { query, queryOne, execute } from "../db/client.js";
import { signToken } from "../lib/jwt.js";
import { issueRefreshToken, rotateRefreshToken, revokeRefreshToken, revokeAllForUser } from "../lib/refreshToken.js";
import { hashPassword, verifyPassword, dummyVerify } from "../lib/password.js";
import { issueResetToken, consumeResetToken } from "../lib/passwordReset.js";
import { issueVerificationToken, consumeVerificationToken } from "../lib/emailVerification.js";
import { issueRecoveryCode, verifyAndConsumeRecoveryCode } from "../lib/recoveryCode.js";
import { sendEmail } from "../lib/email.js";
import { appBaseUrl, apiBaseUrl } from "../lib/appBaseUrl.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { getClientIp } from "../lib/clientIp.js";
import { audit } from "../lib/audit.js";
import type { Context } from "hono";
import type { Variables } from "../env.js";
import type { UserRow } from "../db/rows.js";
import { dbMode } from "../db/client.js";

// `syncOK` = is the user's data backed by cloud storage (vs a local-only file)?
// Derived from the DB mode now that the legacy app-level sync status is gone.
const syncOk = () => dbMode() !== "local";

const app = new Hono<{ Variables: Variables }>();

// 10 auth attempts per IP per minute, keyed on the trusted-proxy-resolved IP so
// a spoofed X-Forwarded-For prefix can't be rotated to bypass the limit.
const authRateLimit = createRateLimiter<{ Variables: Variables }>(10, 60_000, getClientIp);

// Reject weak passwords everywhere a new password is set (register / change).
const strongPassword = z
  .string()
  .min(8)
  .max(256)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), {
    message: "Password must include at least one letter and one number",
  });

// Usernames the platform reserves for its own use — never claimable.
const RESERVED_USERNAMES = new Set(["admin", "root", "lumo", "support", "system"]);

// Username rules: 3–32 chars from [A-Za-z0-9_-], not starting/ending with a
// separator, and not a reserved word. All violations surface as VALIDATION_ERROR
// via the inline zod validator (so the frontend gets a per-field message).
const usernameField = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(/^[A-Za-z0-9_-]+$/, "Username may only use letters, numbers, hyphens and underscores")
  .refine((u) => !/^[-_]/.test(u) && !/[-_]$/.test(u), {
    message: "Username can't start or end with a hyphen or underscore",
  })
  .refine((u) => !RESERVED_USERNAMES.has(u.toLowerCase()), {
    message: "That username is reserved",
  });

const RegisterBody = z.object({
  username: usernameField,
  password: strongPassword,
});

const SigninBody = z.object({
  username: z.string().min(1).max(32),
  password: z.string(),
});

const BindEmailBody = z.object({
  email: z.string().email().max(255),
});

const RecoveryResetBody = z.object({
  username: z.string().min(1).max(32),
  code: z.string().min(1).max(64),
  new_password: strongPassword,
});

const ChangePasswordBody = z.object({
  current_password: z.string().max(256),
  new_password: strongPassword,
});

const RefreshBody = z.object({
  refreshToken: z.string().min(1).max(512),
});

const ForgotPasswordBody = z.object({
  email: z.string().email().max(255),
});

const ResetPasswordBody = z.object({
  token: z.string().min(1).max(512),
  new_password: strongPassword,
});

const VerifyEmailBody = z.object({
  token: z.string().min(1).max(512),
});

/**
 * Issue a fresh verification token and email the confirmation link. Best-effort:
 * a delivery failure is logged by the email lib but never blocks the caller
 * (registration must still succeed if email is down).
 *
 * `apiBase` is the resolved public API origin (see lib/appBaseUrl.apiBaseUrl) —
 * the link points at the API's own `GET /v1/auth/verify-email`, NOT the SPA, so
 * the click always lands on the server that minted the token (reachable with no
 * cross-origin SPA load / CORS). That endpoint verifies server-side and then
 * redirects the browser to the SPA result page.
 */
async function sendVerificationEmail(userId: string, email: string, name: string, apiBase: string): Promise<void> {
  const rawToken = await issueVerificationToken(userId);
  const link = `${apiBase}/v1/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
  await sendEmail({
    to: email,
    subject: "Verify your Lumo email",
    text:
      `Hi ${name},\n\n` +
      `Welcome to Lumo! Please confirm your email address by opening the link below. ` +
      `It expires in 24 hours.\n\n` +
      `${link}\n\n` +
      `If you didn't create a Lumo account, you can safely ignore this email.`,
  });
}

function clientIp(c: Context<{ Variables: Variables }>): string {
  return getClientIp(c);
}

// A username is a single token (no spaces), so derive a 1–2 char avatar label
// from its first alphanumerics rather than word-splitting.
function initialsFromUsername(username: string) {
  const compact = username.replace(/[^A-Za-z0-9]/g, "");
  return (compact.slice(0, 2) || username.slice(0, 2) || "U").toUpperCase();
}

app.post("/register", authRateLimit, validate("json", RegisterBody), async (c) => {
  const { username, password } = c.req.valid("json");
  const usernameLower = username.toLowerCase();

  const existing = await queryOne(
    "SELECT id FROM users WHERE username_lower = :ul",
    { ul: usernameLower },
  );
  if (existing) return httpError(c, 409, "USERNAME_TAKEN", "Username already taken");

  const id = "u_" + nanoid(10);
  const password_hash = await hashPassword(password);
  // Username-only registration: the display name defaults to the username and
  // there is no email yet (bound later via /bind-email).
  const name = username;
  const initials = initialsFromUsername(username);
  const now = new Date().toISOString();

  await execute(`
    INSERT INTO users (id, email, username, username_lower, password_hash, name, initials, local, plan, email_verified, created_at)
    VALUES (:id, NULL, :username, :username_lower, :password_hash, :name, :initials, 0, 'free', 0, :now)
  `, { id, username, username_lower: usernameLower, password_hash, name, initials, now });

  await execute("INSERT INTO settings (user_id) VALUES (:user_id)", { user_id: id });

  const token = await signToken(id, 0);
  const refreshToken = await issueRefreshToken(id, 0);
  // Issue the one-time recovery code (the universal offline reset fallback).
  // Its plaintext is returned ONCE here and never logged.
  const recoveryCode = await issueRecoveryCode(id);
  audit("auth.register", { userId: id, username, ip: clientIp(c) });
  audit("auth.recovery_code.issued", { userId: id, ip: clientIp(c) });

  return c.json({
    token,
    refreshToken,
    recoveryCode,
    user: {
      id, username, email: null, name, initials, local: false, emailVerified: false,
      plan: "free", renewsAt: null,
      stats: { tasks: 0, pomodoros: 0, syncOK: syncOk() },
    },
  }, 201);
});

app.post("/signin", authRateLimit, validate("json", SigninBody), async (c) => {
  const { username, password } = c.req.valid("json");
  const usernameLower = username.toLowerCase();

  const user = await queryOne<UserRow>(
    "SELECT * FROM users WHERE username_lower = :ul",
    { ul: usernameLower },
  );
  if (!user) {
    // Spend equivalent bcrypt time so latency can't enumerate registered users.
    await dummyVerify(password);
    audit("auth.signin.fail", { username, ip: clientIp(c), reason: "no_user" });
    return httpError(c, 401, "INVALID_CREDENTIALS", "Invalid credentials");
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    audit("auth.signin.fail", { username, ip: clientIp(c), reason: "bad_password" });
    return httpError(c, 401, "INVALID_CREDENTIALS", "Invalid credentials");
  }
  audit("auth.signin.ok", { userId: user.id, ip: clientIp(c) });

  const stats = await queryOne<{ task_count: number; pomo_count: number }>(`
    SELECT
      COUNT(CASE WHEN completed = 0 THEN 1 END) as task_count,
      COALESCE(SUM(pomos_done), 0) as pomo_count
    FROM tasks WHERE user_id = :uid AND deleted_at IS NULL
  `, { uid: user.id });

  const token = await signToken(user.id, user.session_version ?? 0);
  const refreshToken = await issueRefreshToken(user.id, user.session_version ?? 0);

  return c.json({
    token,
    refreshToken,
    user: {
      id: user.id,
      username: user.username ?? "",
      email: user.email ?? null,
      name: user.name,
      initials: user.initials,
      local: Boolean(user.local),
      emailVerified: Boolean(user.email_verified),
      plan: user.plan ?? "free",
      renewsAt: user.renews_at ?? null,
      stats: { tasks: stats?.task_count ?? 0, pomodoros: stats?.pomo_count ?? 0, syncOK: syncOk() },
    },
  });
});

// Bind (or change) the signed-in account's email. The email is set UNVERIFIED
// and a verification link is sent via the existing flow — an unverified/absent
// email never blocks usage. EMAIL_TAKEN (409) if another account already owns it.
app.post("/bind-email", authRateLimit, authMiddleware, validate("json", BindEmailBody), async (c) => {
  const userId = c.get("userId") as string;
  const { email } = c.req.valid("json");

  const user = await queryOne<UserRow>("SELECT * FROM users WHERE id = :id", { id: userId });
  if (!user) return httpError(c, 404, "NOT_FOUND", "Not found");

  const clash = await queryOne<{ id: string }>(
    "SELECT id FROM users WHERE email = :email AND id != :id",
    { email, id: userId },
  );
  if (clash) return httpError(c, 409, "EMAIL_TAKEN", "Email already registered");

  await execute(
    "UPDATE users SET email = :email, email_verified = 0 WHERE id = :id",
    { email, id: userId },
  );
  // Invalidate any outstanding verification tokens issued for a PREVIOUS email.
  // Tokens are not email-scoped (they only carry the userId), so without this a
  // stale link from an earlier address would flip `email_verified` on for the
  // newly-bound, unconfirmed email.
  await execute("DELETE FROM email_verification_tokens WHERE user_id = :id", { id: userId });
  audit("auth.bind_email", { userId, ip: clientIp(c) });

  // Best-effort verification email — binding succeeds even if delivery is down.
  await sendVerificationEmail(userId, email, user.name, apiBaseUrl(c));
  audit("auth.verify_email.sent", { userId, ip: clientIp(c) });

  return c.json({ ok: true, email, emailVerified: false });
});

// Reset a password with a recovery code (the offline fallback, always available).
// Public + rate-limited. Verifies and single-use-consumes the code, then rotates
// the password exactly like /reset-password (bump session_version + revoke all
// refresh tokens). Wrong/used/again → INVALID_RECOVERY_CODE (constant-time,
// non-enumerable — the same error whether the username or the code is at fault).
app.post("/recovery/reset", authRateLimit, validate("json", RecoveryResetBody), async (c) => {
  const { username, code, new_password } = c.req.valid("json");

  const userId = await verifyAndConsumeRecoveryCode(username, code);
  if (!userId) {
    audit("auth.recovery_reset.fail", { ip: clientIp(c) });
    return httpError(c, 400, "INVALID_RECOVERY_CODE", "That recovery code is invalid or has already been used.");
  }

  const new_hash = await hashPassword(new_password);
  await execute(
    "UPDATE users SET password_hash = :hash, session_version = session_version + 1 WHERE id = :id",
    { hash: new_hash, id: userId },
  );
  await revokeAllForUser(userId);
  audit("auth.recovery_reset.ok", { userId, ip: clientIp(c) });

  return c.json({ ok: true });
});

// Regenerate the signed-in account's recovery code — invalidates the previous
// one and returns the new plaintext exactly once. Never returned by any GET.
app.post("/recovery-code/regenerate", authRateLimit, authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const user = await queryOne<{ id: string }>("SELECT id FROM users WHERE id = :id", { id: userId });
  if (!user) return httpError(c, 404, "NOT_FOUND", "Not found");
  const recoveryCode = await issueRecoveryCode(userId);
  audit("auth.recovery_code.regenerated", { userId, ip: clientIp(c) });
  return c.json({ recoveryCode });
});

app.post("/change-password", authRateLimit, authMiddleware, validate("json", ChangePasswordBody), async (c) => {
  const userId = c.get("userId") as string;
  const { current_password, new_password } = c.req.valid("json");

  const user = await queryOne<Pick<UserRow, "password_hash">>(
    "SELECT password_hash FROM users WHERE id = :id", { id: userId }
  );
  if (!user) return httpError(c, 404, "NOT_FOUND", "Not found");

  const ok = await verifyPassword(current_password, user.password_hash);
  if (!ok) {
    audit("auth.password_change.fail", { userId, ip: clientIp(c) });
    return httpError(c, 400, "WRONG_PASSWORD", "Current password is incorrect");
  }

  const new_hash = await hashPassword(new_password);
  // Bump the session version so every previously-issued token is now rejected.
  await execute(
    "UPDATE users SET password_hash = :hash, session_version = session_version + 1 WHERE id = :id",
    { hash: new_hash, id: userId },
  );
  audit("auth.password_change", { userId, ip: clientIp(c) });

  return c.json({ ok: true });
});

// Exchange a valid refresh token for a fresh access token + a rotated refresh
// token. No access token required (the access token may already be expired —
// that is the whole point). Rate-limited like the other auth endpoints.
app.post("/refresh", authRateLimit, validate("json", RefreshBody), async (c) => {
  const { refreshToken } = c.req.valid("json");
  const rotated = await rotateRefreshToken(refreshToken);
  if (!rotated) {
    audit("auth.refresh.fail", { ip: clientIp(c) });
    return httpError(c, 401, "INVALID_REFRESH_TOKEN", "Invalid or expired refresh token");
  }
  const token = await signToken(rotated.userId, rotated.sessionVersion);
  audit("auth.refresh.ok", { userId: rotated.userId, ip: clientIp(c) });
  return c.json({ token, refreshToken: rotated.token });
});

// Request a password reset link. ALWAYS returns 200 with the same body whether
// or not the email is registered — the response must never reveal which emails
// have accounts (enumeration). If the user exists, a single-use, short-lived
// token is minted and emailed as a reset link; delivery failures are logged but
// do not change the response.
app.post("/forgot-password", authRateLimit, validate("json", ForgotPasswordBody), async (c) => {
  const { email } = c.req.valid("json");
  const user = await queryOne<Pick<UserRow, "id" | "name">>(
    "SELECT id, name FROM users WHERE email = :email",
    { email },
  );

  if (user) {
    const rawToken = await issueResetToken(user.id);
    const link = `${appBaseUrl(c)}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await sendEmail({
      to: email,
      subject: "Reset your Lumo password",
      text:
        `Hi ${user.name},\n\n` +
        `We received a request to reset your Lumo password. ` +
        `Open the link below to choose a new one. It expires in 30 minutes and can be used once.\n\n` +
        `${link}\n\n` +
        `If you didn't request this, you can safely ignore this email — your password won't change.`,
    });
    audit("auth.password_reset.request", { userId: user.id, ip: clientIp(c) });
  } else {
    // Log the miss for monitoring, but respond identically to the hit case.
    audit("auth.password_reset.request_unknown", { email, ip: clientIp(c) });
  }

  return c.json({ ok: true });
});

// Complete a password reset with a token from the emailed link. On success the
// password is replaced, `session_version` is bumped (invalidating every existing
// access token), and all refresh tokens are revoked — so a reset also logs the
// account out everywhere, which is the safe behavior for a recovery flow.
app.post("/reset-password", authRateLimit, validate("json", ResetPasswordBody), async (c) => {
  const { token, new_password } = c.req.valid("json");

  const userId = await consumeResetToken(token);
  if (!userId) {
    audit("auth.password_reset.fail", { ip: clientIp(c) });
    return httpError(c, 400, "INVALID_RESET_TOKEN", "This reset link is invalid or has expired. Request a new one.");
  }

  const new_hash = await hashPassword(new_password);
  await execute(
    "UPDATE users SET password_hash = :hash, session_version = session_version + 1 WHERE id = :id",
    { hash: new_hash, id: userId },
  );
  await revokeAllForUser(userId);
  audit("auth.password_reset.ok", { userId, ip: clientIp(c) });

  return c.json({ ok: true });
});

// Minimal, dependency-free result page rendered ONLY when no SPA origin is known
// (LUMO_APP_BASE_URL unset AND no derivable request host) — so a click still ends
// on a coherent outcome even in a misconfigured deployment. The happy path below
// redirects to the branded SPA result page instead.
function verifyResultPage(ok: boolean): string {
  const title = ok ? "Email verified" : "Verification link invalid";
  const body = ok
    ? "Your email address has been verified. You can close this window and return to Lumo."
    : "This verification link is invalid or has expired. Request a fresh link from the app.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${title}</title></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem;text-align:center;color:#1a1a1a">` +
    `<h1 style="font-size:1.25rem">${title}</h1><p style="color:#555;line-height:1.6">${body}</p></body></html>`;
}

// Confirm an email by opening the emailed link (GET — the click IS the intent).
// The link points at THIS API, so the click always reaches a live endpoint and
// verification completes server-side HERE, with no dependency on the SPA booting
// or a cross-origin POST. On completion we redirect the browser to the SPA result
// page (?status=success|invalid); if no SPA origin is known we render a minimal
// self-contained page so the user still sees the outcome. Public + rate-limited.
// Single-use: a valid token flips the flag once; a reused/expired/unknown token
// lands on the invalid result.
//
// NOTE: a GET link may be pre-fetched by email security scanners, which would
// consume the single-use token before the human clicks. The end state is still
// correct (the email is verified); the human's later click then shows the
// invalid result with a path to request a fresh link. This is an accepted,
// standard trade-off for verification links (unlike password reset, where the
// POST + new-password form makes prefetch inert).
app.get("/verify-email", authRateLimit, async (c) => {
  const token = c.req.query("token") ?? "";
  let ok = false;
  if (token) {
    const userId = await consumeVerificationToken(token);
    if (userId) {
      await execute("UPDATE users SET email_verified = 1 WHERE id = :id", { id: userId });
      audit("auth.verify_email.ok", { userId, ip: clientIp(c) });
      ok = true;
    }
  }
  if (!ok) audit("auth.verify_email.fail", { ip: clientIp(c) });

  const base = appBaseUrl(c);
  if (base) {
    return c.redirect(`${base}/verify-email?status=${ok ? "success" : "invalid"}`, 302);
  }
  return c.html(verifyResultPage(ok), ok ? 200 : 400);
});

// Confirm an email address with the token from the verification link. Public
// (the user may not be signed in on the device they open the link with) and
// rate-limited. Retained for backward compatibility with older links that point
// straight at the SPA (which POSTs the token here), and for programmatic clients.
// Idempotent-ish: a valid token flips the flag once; reusing it (now consumed)
// returns the invalid-token error.
app.post("/verify-email", authRateLimit, validate("json", VerifyEmailBody), async (c) => {
  const { token } = c.req.valid("json");
  const userId = await consumeVerificationToken(token);
  if (!userId) {
    audit("auth.verify_email.fail", { ip: clientIp(c) });
    return httpError(c, 400, "INVALID_VERIFICATION_TOKEN", "This verification link is invalid or has expired. Request a new one.");
  }
  await execute("UPDATE users SET email_verified = 1 WHERE id = :id", { id: userId });
  audit("auth.verify_email.ok", { userId, ip: clientIp(c) });
  return c.json({ ok: true });
});

// Re-send the verification email for the signed-in user. No-op (still 200) when
// the account is already verified, so the response never depends on state in a
// way a caller could probe.
app.post("/resend-verification", authRateLimit, authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const user = await queryOne<UserRow>("SELECT * FROM users WHERE id = :id", { id: userId });
  if (!user) return httpError(c, 404, "NOT_FOUND", "Not found");
  // No-op (still 200) when already verified OR when no email is bound — the
  // response never depends on state in a way a caller could probe.
  if (user.email && !user.email_verified) {
    await sendVerificationEmail(user.id, user.email, user.name, apiBaseUrl(c));
    audit("auth.verify_email.resend", { userId, ip: clientIp(c) });
  }
  return c.json({ ok: true });
});

app.post("/signout", authMiddleware, async (c) => {
  const jti = c.get("jti") as string;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await execute(
    "INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (:jti, :expires_at)",
    { jti, expires_at: expiresAt }
  );
  // Also revoke the presented refresh token, if the client sent one, so it can't
  // be used to mint new access tokens after sign-out. Body is optional to stay
  // backward-compatible with older clients that sign out with no body.
  const body = await c.req.json().catch(() => null);
  const rt = body && typeof body.refreshToken === "string" ? body.refreshToken : null;
  if (rt) await revokeRefreshToken(rt);
  audit("auth.signout", { userId: c.get("userId"), ip: clientIp(c) });
  return c.json({ ok: true });
});

export default app;
