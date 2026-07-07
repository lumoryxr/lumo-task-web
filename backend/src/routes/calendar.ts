/**
 * Calendar interop (#169 V1 — read-only ICS feed).
 *
 * A per-user opaque `calendar_feed_token` acts as a revocable secret URL (the
 * Google/Apple "secret iCal address" model): whoever holds the URL can read the
 * user's open tasks-with-due-dates + countdown events as an .ics subscription.
 * The token is the capability — the feed endpoint itself is unauthenticated so
 * calendar clients (Google/Apple/Outlook) can poll it without OAuth. Rotating
 * the token invalidates the old URL.
 */
import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { query, queryOne, execute } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { getClientIp } from "../lib/clientIp.js";
import { buildICS, icsTimestamp, type ICSEvent } from "../lib/ics.js";
import type { Variables } from "../env.js";

const app = new Hono<{ Variables: Variables }>();

/** 32 bytes of entropy, URL-safe. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Return the user's feed token, lazily generating one on first access. */
async function ensureToken(userId: string): Promise<string> {
  const row = await queryOne<{ calendar_feed_token: string | null }>(
    "SELECT calendar_feed_token FROM users WHERE id = :id",
    { id: userId },
  );
  if (row?.calendar_feed_token) return row.calendar_feed_token;
  const token = newToken();
  await execute("UPDATE users SET calendar_feed_token = :t WHERE id = :id", { t: token, id: userId });
  return token;
}

function feedUrl(reqUrl: string, token: string): string {
  const origin = new URL(reqUrl).origin;
  return `${origin}/v1/calendar/feed.ics?token=${encodeURIComponent(token)}`;
}

// ── Public feed — no auth; the token is the capability ────────────────────────
// IP rate-limited so an unauthenticated token-guessing sweep is bounded.
const feedRateLimit = createRateLimiter<{ Variables: Variables }>(60, 60_000, (c) => getClientIp(c));

app.get("/feed.ics", feedRateLimit, async (c) => {
  const token = c.req.query("token");
  // Same 404 for missing and unknown tokens — never confirm a token's validity.
  if (!token) return httpError(c, 404, "NOT_FOUND", "Feed not found");

  const user = await queryOne<{ id: string; name: string }>(
    "SELECT id, name FROM users WHERE calendar_feed_token = :t",
    { t: token },
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
});

// ── Authed management — get the URL, or rotate to revoke the old one ───────────
app.get("/feed", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const token = await ensureToken(userId);
  return c.json({ token, url: feedUrl(c.req.url, token) });
});

app.post("/feed/rotate", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  const token = newToken();
  await execute("UPDATE users SET calendar_feed_token = :t WHERE id = :id", { t: token, id: userId });
  return c.json({ token, url: feedUrl(c.req.url, token) });
});

export default app;
