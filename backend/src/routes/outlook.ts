/**
 * Server-side Outlook calendar proxy using client credentials (app-only auth).
 *
 * Required env vars:
 *   LUMO_MS_TENANT_ID     — Azure AD tenant ID or domain (e.g. contoso.onmicrosoft.com)
 *   LUMO_MS_CLIENT_ID     — App registration client ID
 *   LUMO_MS_CLIENT_SECRET — App registration client secret
 *   LUMO_MS_USER_EMAIL    — The mailbox to read (e.g. user@contoso.com)
 *
 * The App Registration needs:
 *   Microsoft Graph → Application permissions → Calendars.Read
 *   (Admin consent required — no per-user OAuth popup needed)
 */

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import type { Variables } from "../env.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

const outlookRateLimit = createRateLimiter<{ Variables: Variables }>(30, 60_000, (c) => c.get("userId") as string);

const TENANT_ID = process.env.LUMO_MS_TENANT_ID;
const CLIENT_ID = process.env.LUMO_MS_CLIENT_ID;
const CLIENT_SECRET = process.env.LUMO_MS_CLIENT_SECRET;
const USER_EMAIL = process.env.LUMO_MS_USER_EMAIL;

let _cachedToken: { value: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken && _cachedToken.expiresAt > now + 60_000) {
    return _cachedToken.value;
  }

  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Token request failed (${res.status})`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  _cachedToken = {
    value: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return _cachedToken.value;
}

// GET /outlook/status — tells the frontend whether server-side mode is configured
app.get("/status", (c) => {
  const configured = Boolean(TENANT_ID && CLIENT_ID && CLIENT_SECRET && USER_EMAIL);
  return c.json({ configured, userEmail: configured ? USER_EMAIL : null });
});

// GET /outlook/calendar?start=ISO&end=ISO
app.get("/calendar", outlookRateLimit, async (c) => {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !USER_EMAIL) {
    return httpError(c, 503, "OUTLOOK_NOT_CONFIGURED", "Outlook server credentials not configured");
  }

  const start = c.req.query("start");
  const end = c.req.query("end");
  if (!start || !end) {
    return httpError(c, 400, "MISSING_PARAMS", "start and end query params are required");
  }

  try {
    const token = await getAppToken();
    const url =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(USER_EMAIL)}/calendarView` +
      `?startDateTime=${encodeURIComponent(start)}` +
      `&endDateTime=${encodeURIComponent(end)}` +
      `&$select=id,subject,start,end,location,isAllDay` +
      `&$orderby=start/dateTime` +
      `&$top=100`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Graph API error ${res.status}`);
    }

    const data = await res.json() as { value: unknown[] };
    return c.json({ events: data.value ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("error", { requestId: c.get("requestId"), route: "GET /v1/outlook/calendar", msg });
    return httpError(c, 502, "OUTLOOK_FETCH_FAILED", msg);
  }
});

export default app;
