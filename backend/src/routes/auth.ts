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
import { sendEmail } from "../lib/email.js";
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

const RegisterBody = z.object({
  email: z.string().email().max(255),
  password: strongPassword,
  name: z.string().min(1).max(100),
});

const SigninBody = z.object({
  email: z.string().email(),
  password: z.string(),
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

/** Absolute base URL of the web app, used to build links in emails. */
function appBaseUrl(): string {
  return (process.env.LUMO_APP_BASE_URL || "https://lumo-task-web.vercel.app").replace(/\/+$/, "");
}

/**
 * Issue a fresh verification token and email the confirmation link. Best-effort:
 * a delivery failure is logged by the email lib but never blocks the caller
 * (registration must still succeed if email is down).
 */
async function sendVerificationEmail(userId: string, email: string, name: string): Promise<void> {
  const rawToken = await issueVerificationToken(userId);
  const link = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
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

function makeInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

app.post("/register", authRateLimit, validate("json", RegisterBody), async (c) => {
  const { email, password, name } = c.req.valid("json");

  const existing = await queryOne("SELECT id FROM users WHERE email = :email", { email });
  if (existing) return httpError(c, 409, "EMAIL_TAKEN", "Email already registered");

  const id = "u_" + nanoid(10);
  const password_hash = await hashPassword(password);
  const initials = makeInitials(name);
  const now = new Date().toISOString();

  await execute(`
    INSERT INTO users (id, email, password_hash, name, initials, local, plan, created_at)
    VALUES (:id, :email, :password_hash, :name, :initials, 0, 'free', :now)
  `, { id, email, password_hash, name, initials, now });

  await execute("INSERT INTO settings (user_id) VALUES (:user_id)", { user_id: id });

  const token = await signToken(id, 0);
  const refreshToken = await issueRefreshToken(id, 0);
  audit("auth.register", { userId: id, email, ip: clientIp(c) });

  // Send the email-verification link. Non-blocking: registration succeeds even
  // if email delivery is down (verification is a soft nudge, not a gate).
  await sendVerificationEmail(id, email, name);
  audit("auth.verify_email.sent", { userId: id, ip: clientIp(c) });

  return c.json({
    token,
    refreshToken,
    user: {
      id, email, name, initials, local: false, emailVerified: false, plan: "free", renewsAt: null,
      stats: { tasks: 0, pomodoros: 0, syncOK: syncOk() },
    },
  }, 201);
});

app.post("/signin", authRateLimit, validate("json", SigninBody), async (c) => {
  const { email, password } = c.req.valid("json");

  const user = await queryOne<UserRow>("SELECT * FROM users WHERE email = :email", { email });
  if (!user) {
    // Spend equivalent bcrypt time so latency can't enumerate registered emails.
    await dummyVerify(password);
    audit("auth.signin.fail", { email, ip: clientIp(c), reason: "no_user" });
    return httpError(c, 401, "INVALID_CREDENTIALS", "Invalid credentials");
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    audit("auth.signin.fail", { email, ip: clientIp(c), reason: "bad_password" });
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
      email: user.email,
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
    const link = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
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

// Confirm an email address with the token from the verification link. Public
// (the user may not be signed in on the device they open the link with) and
// rate-limited. Idempotent-ish: a valid token flips the flag once; reusing it
// (now consumed) returns the invalid-token error.
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
  if (!user.email_verified) {
    await sendVerificationEmail(user.id, user.email, user.name);
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
