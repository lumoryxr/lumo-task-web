/**
 * GitHub OAuth login routes (#15) — web-only, env-gated with graceful degradation.
 *
 * Mounted under `/v1/auth/github`. The whole Authorization-Code exchange runs
 * server-side so the GitHub `client_secret` never reaches the browser, and the
 * resulting Lumo session is handed to the SPA via a one-time `code` (never a
 * token in a URL fragment). Every endpoint is rate-limited and audited (without
 * secrets). When the server is not configured (`LUMO_GITHUB_CLIENT_ID` /
 * `LUMO_GITHUB_CLIENT_SECRET` unset) `/start` returns 501 and `/config` reports
 * `githubEnabled: false` so the frontend hides the button.
 */
import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import { randomBytes } from "node:crypto";
import { validate } from "../lib/validate.js";
import { query, queryOne, execute, dbMode } from "../db/client.js";
import { signToken } from "../lib/jwt.js";
import { issueRefreshToken } from "../lib/refreshToken.js";
import { issueRecoveryCode } from "../lib/recoveryCode.js";
import { hashPassword } from "../lib/password.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { getClientIp } from "../lib/clientIp.js";
import { audit } from "../lib/audit.js";
import { githubOauth } from "../lib/githubOauth.js";
import { appBaseUrl } from "../lib/appBaseUrl.js";
import type { Context } from "hono";
import type { Variables } from "../env.js";
import type { UserRow } from "../db/rows.js";

const app = new Hono<{ Variables: Variables }>();

// OAuth-flow limiter — more generous than the credential endpoints: a single
// GitHub login spends 3 hits (start + callback + exchange), and none of these
// are password-guessable (state + handoff are high-entropy single-use tokens),
// so a tight limit would throttle legitimate NAT'd users (offices/campuses/
// carriers) for no security gain.
const oauthRateLimit = createRateLimiter<{ Variables: Variables }>(30, 60_000, getClientIp);

const syncOk = () => dbMode() !== "local";

// State + handoff codes are only valid for a few minutes; the callback happens
// seconds after /start and the SPA exchanges the handoff immediately.
const STATE_TTL_MS = 10 * 60_000;
const HANDOFF_TTL_MS = 5 * 60_000;

const RESERVED_USERNAMES = new Set(["admin", "root", "lumo", "support", "system"]);

function clientIp(c: Context<{ Variables: Variables }>): string {
  return getClientIp(c);
}

function initialsFromUsername(username: string): string {
  const compact = username.replace(/[^A-Za-z0-9]/g, "");
  return (compact.slice(0, 2) || username.slice(0, 2) || "U").toUpperCase();
}

/**
 * Derive a valid, unique Lumo username from a GitHub `login`. Sanitizes to the
 * username charset [A-Za-z0-9_-], trims separators, enforces the 3–32 length,
 * avoids reserved handles, and de-duplicates against existing accounts with a
 * numeric suffix (case-insensitive, matching the username uniqueness key).
 */
async function deriveUniqueUsername(login: string): Promise<string> {
  let base = (login || "user").replace(/[^A-Za-z0-9_-]/g, "");
  base = base.replace(/^[-_]+/, "").replace(/[-_]+$/, "");
  if (base.length < 3) base = `gh${base}`;
  base = base.slice(0, 32).replace(/[-_]+$/, "") || "user";
  if (RESERVED_USERNAMES.has(base.toLowerCase())) base = `gh-${base}`.slice(0, 32);

  let candidate = base;
  let n = 1;
  // Bounded loop: append an incrementing numeric suffix until the lowercased
  // handle is free. The partial-unique index is the ultimate guarantor.
  while (true) {
    const taken = await queryOne<{ id: string }>(
      "SELECT id FROM users WHERE username_lower = :ul",
      { ul: candidate.toLowerCase() },
    );
    if (!taken) return candidate;
    const suffix = String(n++);
    candidate = base.slice(0, 32 - suffix.length) + suffix;
  }
}

/** Build the signin-shaped user object for a userId (same fields as /signin). */
async function buildUserResponse(userId: string) {
  const user = await queryOne<UserRow>("SELECT * FROM users WHERE id = :id", { id: userId });
  if (!user) return null;
  const stats = await queryOne<{ task_count: number; pomo_count: number }>(
    `SELECT
       COUNT(CASE WHEN completed = 0 THEN 1 END) as task_count,
       COALESCE(SUM(pomos_done), 0) as pomo_count
     FROM tasks WHERE user_id = :uid AND deleted_at IS NULL`,
    { uid: userId },
  );
  return {
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
  };
}

// GET /config — public, unauthenticated. Lets the frontend decide whether to
// render the GitHub button at all (hidden when the server has no credentials).
app.get("/config", (c) => {
  return c.json({ githubEnabled: githubOauth.isConfigured() });
});

// GET /start — mint a single-use CSRF state and 302 to GitHub's authorize page.
// 501 when the server is not configured (the frontend also hides the button, so
// this is a backstop for a direct hit).
app.get("/start", oauthRateLimit, async (c) => {
  if (!githubOauth.isConfigured()) {
    return httpError(c, 501, "OAUTH_NOT_CONFIGURED", "GitHub login is not enabled on this server.");
  }
  const state = nanoid(32);
  await execute(
    "INSERT INTO oauth_states (state, created_at) VALUES (:state, :now)",
    { state, now: new Date().toISOString() },
  );
  audit("auth.github.start", { ip: clientIp(c) });
  return c.redirect(githubOauth.buildAuthorizeUrl(state), 302);
});

/**
 * Validate + single-use-consume an OAuth `state`. Returns true only when the
 * state is known, unexpired, and not previously consumed — the UPDATE's
 * `changes` count makes the consume atomic against a double-submit.
 */
async function consumeState(state: string): Promise<boolean> {
  const row = await queryOne<{ created_at: string; used_at: string | null }>(
    "SELECT created_at, used_at FROM oauth_states WHERE state = :s",
    { s: state },
  );
  if (!row || row.used_at) return false;
  if (Date.now() - new Date(row.created_at).getTime() > STATE_TTL_MS) return false;
  const res = await execute(
    "UPDATE oauth_states SET used_at = :now WHERE state = :s AND used_at IS NULL",
    { now: new Date().toISOString(), s: state },
  );
  return res.changes === 1;
}

// GET /callback — GitHub redirects here with ?code&state. Validate state, run
// the server-side token exchange + profile fetch, resolve/create the account,
// mint a Lumo session, and hand it to the SPA via a one-time handoff code. Any
// failure redirects back to /login with a readable error flag (never a 500 page
// or a token in the URL).
app.get("/callback", oauthRateLimit, async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  // The callback is ALWAYS a top-level browser navigation, so every failure
  // redirects to the login page with a readable flag — never a raw JSON body.
  if (!githubOauth.isConfigured()) {
    return c.redirect(`${appBaseUrl(c)}/#/login?error=oauth`, 302);
  }
  if (!state || !(await consumeState(state))) {
    audit("auth.github.state_invalid", { ip: clientIp(c) });
    return c.redirect(`${appBaseUrl(c)}/#/login?error=oauth`, 302);
  }
  if (!code) {
    // User denied / GitHub error — no code to exchange. Back to login.
    audit("auth.github.callback_no_code", { ip: clientIp(c) });
    return c.redirect(`${appBaseUrl(c)}/#/login?error=oauth`, 302);
  }

  let ghUser: { id: string; login: string };
  try {
    const accessToken = await githubOauth.exchangeCode(code);
    ghUser = await githubOauth.fetchGithubUser(accessToken);
  } catch {
    // Upstream exchange/user-fetch failure. The design routes this back to the
    // login page for the user; the audit records the failure server-side.
    audit("auth.github.exchange_failed", { ip: clientIp(c) });
    return c.redirect(`${appBaseUrl(c)}/#/login?error=oauth`, 302);
  }

  try {
    // Resolve: an existing GitHub identity logs into its account…
    let userId: string;
    const existing = await queryOne<{ id: string; session_version: number }>(
      "SELECT id, session_version FROM users WHERE github_user_id = :gid",
      { gid: ghUser.id },
    );
    if (existing) {
      userId = existing.id;
      audit("auth.github.login", { userId, ip: clientIp(c) });
    } else {
      // …otherwise create a NEW username-only account. GitHub email is NOT
      // auto-trusted: email stays NULL / unverified until the user binds it.
      const username = await deriveUniqueUsername(ghUser.login);
      const usernameLower = username.toLowerCase();
      userId = "u_" + nanoid(10);
      // OAuth accounts have no user-known password; store a random unusable hash.
      // The user can set a real password later via the recovery-code flow.
      const passwordHash = await hashPassword("gh_" + randomBytes(24).toString("hex"));
      const initials = initialsFromUsername(username);
      const now = new Date().toISOString();
      await execute(
        `INSERT INTO users (id, email, username, username_lower, password_hash, name, initials, local, plan, email_verified, github_user_id, created_at)
         VALUES (:id, NULL, :username, :username_lower, :password_hash, :name, :initials, 0, 'free', 0, :gid, :now)`,
        { id: userId, username, username_lower: usernameLower, password_hash: passwordHash, name: username, initials, gid: ghUser.id, now },
      );
      await execute("INSERT INTO settings (user_id) VALUES (:user_id)", { user_id: userId });
      // Issue the one-time recovery code (same as normal registration).
      await issueRecoveryCode(userId);
      audit("auth.github.register", { userId, username, ip: clientIp(c) });
      audit("auth.recovery_code.issued", { userId, ip: clientIp(c) });
    }

    const sv = existing?.session_version ?? 0;
    const token = await signToken(userId, sv);
    const refreshToken = await issueRefreshToken(userId, sv);

    // Stash the session behind a one-time handoff code; the SPA exchanges it.
    const handoff = nanoid(32);
    await execute(
      `INSERT INTO oauth_handoffs (code, user_id, token, refresh_token, created_at)
       VALUES (:code, :uid, :token, :rt, :now)`,
      { code: handoff, uid: userId, token, rt: refreshToken, now: new Date().toISOString() },
    );
    return c.redirect(`${appBaseUrl(c)}/#/oauth/github?code=${encodeURIComponent(handoff)}`, 302);
  } catch {
    audit("auth.github.callback_failed", { ip: clientIp(c) });
    return c.redirect(`${appBaseUrl(c)}/#/login?error=oauth`, 302);
  }
});

const ExchangeBody = z.object({
  code: z.string().min(1).max(128),
});

// POST /exchange — public, rate-limited. The SPA trades the one-time handoff
// code for its Lumo session ({ token, refreshToken, user }). Single-use.
app.post("/exchange", oauthRateLimit, validate("json", ExchangeBody), async (c) => {
  const { code } = c.req.valid("json");
  const row = await queryOne<{ user_id: string; token: string; refresh_token: string; created_at: string; used_at: string | null }>(
    "SELECT user_id, token, refresh_token, created_at, used_at FROM oauth_handoffs WHERE code = :code",
    { code },
  );
  const expired = row ? Date.now() - new Date(row.created_at).getTime() > HANDOFF_TTL_MS : false;
  if (!row || row.used_at || expired) {
    audit("auth.github.exchange_invalid", { ip: clientIp(c) });
    return httpError(c, 400, "OAUTH_STATE_INVALID", "This GitHub sign-in session is invalid or has expired.");
  }
  // Single-use: consume atomically so a double-submit can't reuse the handoff.
  const consumed = await execute(
    "UPDATE oauth_handoffs SET used_at = :now WHERE code = :code AND used_at IS NULL",
    { now: new Date().toISOString(), code },
  );
  if (consumed.changes !== 1) {
    return httpError(c, 400, "OAUTH_STATE_INVALID", "This GitHub sign-in session is invalid or has expired.");
  }

  const user = await buildUserResponse(row.user_id);
  if (!user) return httpError(c, 400, "OAUTH_STATE_INVALID", "This GitHub sign-in session is invalid or has expired.");
  audit("auth.github.exchange_ok", { userId: row.user_id, ip: clientIp(c) });
  return c.json({ token: row.token, refreshToken: row.refresh_token, user });
});

// POST /link — authenticated. Bind the caller's GitHub identity to the current
// account (account-page "Connect GitHub"). 409 if that identity is already bound
// to a DIFFERENT account.
app.post("/link", oauthRateLimit, authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  if (!githubOauth.isConfigured()) {
    return httpError(c, 501, "OAUTH_NOT_CONFIGURED", "GitHub login is not enabled on this server.");
  }
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!state || !(await consumeState(state))) {
    return httpError(c, 400, "OAUTH_STATE_INVALID", "This GitHub link request is invalid or has expired.");
  }
  if (!code) return httpError(c, 400, "OAUTH_STATE_INVALID", "This GitHub link request is invalid or has expired.");

  let ghUser: { id: string; login: string };
  try {
    const accessToken = await githubOauth.exchangeCode(code);
    ghUser = await githubOauth.fetchGithubUser(accessToken);
  } catch {
    audit("auth.github.link_exchange_failed", { userId, ip: clientIp(c) });
    return httpError(c, 502, "OAUTH_EXCHANGE_FAILED", "Couldn't reach GitHub to complete the link. Try again.");
  }

  const clash = await queryOne<{ id: string }>(
    "SELECT id FROM users WHERE github_user_id = :gid AND id != :id",
    { gid: ghUser.id, id: userId },
  );
  if (clash) {
    audit("auth.github.link_conflict", { userId, ip: clientIp(c) });
    return httpError(c, 409, "GITHUB_ALREADY_LINKED", "That GitHub account is already linked to a different Lumo account.");
  }
  await execute("UPDATE users SET github_user_id = :gid WHERE id = :id", { gid: ghUser.id, id: userId });
  audit("auth.github.link_ok", { userId, ip: clientIp(c) });
  return c.json({ ok: true, githubLinked: true });
});

export default app;
