import { Hono } from "hono";
import { validate } from "../lib/validate.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { query, queryOne, execute } from "../db/client.js";
import { signToken } from "../lib/jwt.js";
import { hashPassword, verifyPassword, dummyVerify } from "../lib/password.js";
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
  audit("auth.register", { userId: id, email, ip: clientIp(c) });

  return c.json({
    token,
    user: {
      id, email, name, initials, local: false, plan: "free", renewsAt: null,
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

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      initials: user.initials,
      local: Boolean(user.local),
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

app.post("/signout", authMiddleware, async (c) => {
  const jti = c.get("jti") as string;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await execute(
    "INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (:jti, :expires_at)",
    { jti, expires_at: expiresAt }
  );
  audit("auth.signout", { userId: c.get("userId"), ip: clientIp(c) });
  return c.json({ ok: true });
});

export default app;
