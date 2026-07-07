/**
 * Calendar interop (#169 V1 — read-only ICS feed).
 *
 * A per-user opaque token acts as a revocable secret URL (the Google/Apple
 * "secret iCal address" model): whoever holds the URL can read the user's open
 * tasks-with-due-dates + countdown events as an .ics subscription. The feed
 * endpoint is unauthenticated so calendar clients poll it without OAuth — the
 * token IS the capability.
 *
 * Storage (leak-safe, per the security-non-negotiable rule): the token is never
 * stored raw. Its SHA-256 hash is stored for the O(1) reverse lookup on the
 * public feed (one-way), and an AES-GCM encryption (same at-rest scheme as AI
 * keys) lets Settings re-display the stable URL. A DB leak alone yields neither
 * a usable token (hash) nor the plaintext (needs LUMO_ENCRYPTION_KEY).
 */
import { Hono } from "hono";
import { randomBytes, createHash } from "node:crypto";
import { CalendarFeedResponseSchema } from "@lumo/contracts";
import { query, queryOne, execute } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { getClientIp } from "../lib/clientIp.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";
import { buildICS, icsTimestamp, type ICSEvent } from "../lib/ics.js";
import type { Variables } from "../env.js";

const app = new Hono<{ Variables: Variables }>();

/** 32 bytes of entropy, URL-safe. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Deterministic hash for reverse lookup (the public feed only ever sees this). */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Return the user's raw feed token, lazily generating one on first access.
 * Race-safe: the conditional UPDATE only writes when no token exists yet, then
 * we re-read, so the returned token always equals the persisted one even if two
 * first-access requests race.
 */
async function ensureToken(userId: string): Promise<string> {
  const existing = await queryOne<{ calendar_feed_token_enc: string | null }>(
    "SELECT calendar_feed_token_enc FROM users WHERE id = :id",
    { id: userId },
  );
  if (existing?.calendar_feed_token_enc) return decryptSecret(existing.calendar_feed_token_enc);

  const raw = newToken();
  await execute(
    "UPDATE users SET calendar_feed_token_hash = :h, calendar_feed_token_enc = :e " +
      "WHERE id = :id AND calendar_feed_token_enc IS NULL",
    { h: hashToken(raw), e: encryptSecret(raw), id: userId },
  );
  const row = await queryOne<{ calendar_feed_token_enc: string | null }>(
    "SELECT calendar_feed_token_enc FROM users WHERE id = :id",
    { id: userId },
  );
  return row?.calendar_feed_token_enc ? decryptSecret(row.calendar_feed_token_enc) : raw;
}

/** Generate + persist a brand-new token, invalidating any old one. */
async function rotateToken(userId: string): Promise<string> {
  const raw = newToken();
  await execute(
    "UPDATE users SET calendar_feed_token_hash = :h, calendar_feed_token_enc = :e WHERE id = :id",
    { h: hashToken(raw), e: encryptSecret(raw), id: userId },
  );
  return raw;
}

/** Public origin, honouring the reverse proxy so the URL isn't an internal host. */
function publicOrigin(c: { req: { header(n: string): string | undefined; url: string } }): string {
  const proto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = c.req.header("x-forwarded-host")?.split(",")[0]?.trim() ?? c.req.header("host");
  if (host) return `${proto || "https"}://${host}`;
  return new URL(c.req.url).origin;
}

function feedUrl(c: Parameters<typeof publicOrigin>[0], token: string): string {
  return `${publicOrigin(c)}/v1/calendar/feed.ics?token=${encodeURIComponent(token)}`;
}

// ── Public feed — no auth; the token is the capability ────────────────────────
// IP rate-limited so an unauthenticated token-guessing sweep is bounded.
const feedRateLimit = createRateLimiter<{ Variables: Variables }>(60, 60_000, (c) => getClientIp(c));

app.get("/feed.ics", feedRateLimit, async (c) => {
  const token = c.req.query("token");
  // Same 404 for missing and unknown tokens — never confirm a token's validity.
  if (!token) return httpError(c, 404, "NOT_FOUND", "Feed not found");

  try {
    const user = await queryOne<{ id: string; name: string }>(
      "SELECT id, name FROM users WHERE calendar_feed_token_hash = :h",
      { h: hashToken(token) },
    );
    if (!user) return httpError(c, 404, "NOT_FOUND", "Feed not found");

    const tasks = await query<{ id: string; title_en: string; title_zh: string | null; due: string }>(
      "SELECT id, title_en, title_zh, due FROM tasks WHERE user_id = :uid AND completed = 0 AND deleted_at IS NULL AND due IS NOT NULL",
      { uid: user.id },
    );
    const countdowns = await query<{ id: string; title: string; date: string }>(
      "SELECT id, title, date FROM countdown_events WHERE user_id = :uid AND deleted_at IS NULL",
      { uid: user.id },
    );

    const events: ICSEvent[] = [
      ...tasks.map((t) => ({
        uid: `task-${t.id}@lumo`,
        summary: t.title_en || t.title_zh || "Task",
        date: t.due,
      })),
      ...countdowns.map((cd) => ({
        uid: `countdown-${cd.id}@lumo`,
        summary: cd.title,
        date: cd.date,
      })),
    ];

    const ics = buildICS({
      calName: `Lumo — ${user.name}`,
      events,
      dtstamp: icsTimestamp(new Date()),
    });

    c.header("Content-Type", "text/calendar; charset=utf-8");
    c.header("Content-Disposition", 'inline; filename="lumo.ics"');
    c.header("Cache-Control", "private, max-age=300");
    return c.body(ics);
  } catch {
    return httpError(c, 500, "INTERNAL_ERROR", "Could not build calendar feed");
  }
});

// ── Authed management — get the URL, or rotate to revoke the old one ───────────
app.get("/feed", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const token = await ensureToken(userId);
  return c.json(CalendarFeedResponseSchema.parse({ token, url: feedUrl(c, token) }));
});

app.post("/feed/rotate", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const token = await rotateToken(userId);
  return c.json(CalendarFeedResponseSchema.parse({ token, url: feedUrl(c, token) }));
});

export default app;
