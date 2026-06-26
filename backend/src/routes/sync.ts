/**
 * API · Generic logical sync (ADR-0004 Addendum, 2026-06-26; P1a + P1b-core).
 *
 * P1a (cloud side — the cloud backend serves these to desktop clients):
 *   POST /v1/sync/pull    — per-entity rows changed since an HLC cursor (own rows only).
 *   POST /v1/sync/push    — per-entity LWW upserts of the caller's own rows.
 *
 * P1b-core (local side — the desktop's LOCAL backend serves these to its own UI):
 *   GET  /v1/sync/status  — { mode, enabled, lastSyncedAt, lastError, cursors } (no token).
 *   POST /v1/sync/enable  — sign into the cloud + bind + first reconcile.
 *   POST /v1/sync/disable — clear creds, stop syncing (local data stays).
 *   POST /v1/sync/now     — run one push-then-pull cycle on demand.
 *
 * Isolation (the threat-model chokepoint): `user_id` is taken ONLY from the
 * verified JWT via `c.get("userId")`. Pull scopes every query to it; push forces
 * it onto every row (overwriting any client value) and the upsert additionally
 * guards `<table>.user_id = :uid` so a caller can never mutate another user's
 * row even by colliding on its id. No request field can override identity.
 */
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { httpError } from "../lib/errors.js";
import { dbMode } from "../db/client.js";
import {
  SyncPullRequestSchema,
  SyncPushRequestSchema,
  SyncEnableRequestSchema,
} from "@lumo/contracts";
import { MIN_HLC } from "../lib/hlc.js";
import { pull, push } from "../sync/engine.js";
import { enableSync, disableSync, syncNow, syncStatus } from "../sync/client.js";
import { CloudError } from "../sync/cloudClient.js";
import type { Variables } from "../env.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

// Sync calls move whole batches; keep a generous but bounded per-user budget.
const syncRateLimit = createRateLimiter<{ Variables: Variables }>(
  60, 60_000, (c) => c.get("userId") as string,
);

app.get("/status", async (c) => {
  const userId = c.get("userId") as string;
  return c.json(await syncStatus(userId, dbMode()));
});

app.post("/enable", syncRateLimit, async (c) => {
  const userId = c.get("userId") as string;
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return httpError(c, 400, "INVALID_JSON", "Malformed JSON body");
  }
  const parsed = SyncEnableRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return httpError(c, 400, "BAD_REQUEST", "Invalid enable request");
  }
  // The cloud base URL is a server-trusted constant ONLY — never from the request
  // (that would be an SSRF / credential-exfiltration vector on the shared cloud
  // deployment). The desktop's Electron launcher injects LUMO_CLOUD_API_BASE.
  const cloudBase = process.env.LUMO_CLOUD_API_BASE;
  if (!cloudBase) {
    return httpError(c, 400, "NO_CLOUD_BASE", "Cloud sync is not configured on this build");
  }
  try {
    const status = await enableSync(userId, {
      email: parsed.data.email,
      password: parsed.data.password,
      cloudBase,
    }, dbMode());
    return c.json(status);
  } catch (err) {
    if (err instanceof CloudError) {
      // A bad cloud sign-in (401) maps to a 401; other cloud faults to 502.
      if (err.status === 401) {
        return httpError(c, 401, "CLOUD_AUTH_FAILED", "Cloud sign-in failed");
      }
      return httpError(c, 502, "CLOUD_UNREACHABLE", "Cloud request failed");
    }
    console.error("[sync/enable] failed:", err instanceof Error ? err.message : err);
    return httpError(c, 500, "SYNC_FAILED", "Sync enable failed");
  }
});

app.post("/disable", async (c) => {
  const userId = c.get("userId") as string;
  return c.json(await disableSync(userId, dbMode()));
});

app.post("/now", syncRateLimit, async (c) => {
  const userId = c.get("userId") as string;
  try {
    const result = await syncNow(userId);
    return c.json(result);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "NOT_ENABLED") {
      return httpError(c, 409, "NOT_ENABLED", "Sync is not enabled");
    }
    if (err instanceof CloudError) {
      return httpError(c, 502, "CLOUD_UNREACHABLE", "Cloud request failed");
    }
    console.error("[sync/now] failed:", err instanceof Error ? err.message : err);
    return httpError(c, 500, "SYNC_FAILED", "Sync cycle failed");
  }
});

app.post("/pull", syncRateLimit, async (c) => {
  const userId = c.get("userId") as string;
  // An ABSENT/EMPTY body is valid → full resync (since defaults to MIN_HLC).
  // A non-empty body that is MALFORMED JSON is a 400, consistent with push —
  // we never silently treat a corrupt request as a full resync.
  const text = await c.req.text();
  let raw: unknown = {};
  if (text.trim() !== "") {
    try {
      raw = JSON.parse(text);
    } catch {
      return httpError(c, 400, "INVALID_JSON", "Malformed JSON body");
    }
  }
  const parsed = SyncPullRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return httpError(c, 400, "BAD_REQUEST", "Invalid pull request");
  }
  const since = parsed.data.since ?? MIN_HLC;
  const result = await pull(userId, since);
  return c.json(result);
});

app.post("/push", syncRateLimit, async (c) => {
  const userId = c.get("userId") as string;
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return httpError(c, 400, "INVALID_JSON", "Malformed JSON body");
  }
  const parsed = SyncPushRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return httpError(c, 400, "BAD_REQUEST", "Invalid push request");
  }
  try {
    const result = await push(userId, parsed.data.entities);
    return c.json(result);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "INVALID_ROW") {
      return httpError(c, 400, "INVALID_ROW", "A pushed row failed schema validation");
    }
    console.error("[sync/push] failed:", err instanceof Error ? err.message : err);
    return httpError(c, 500, "SYNC_FAILED", "Sync push failed");
  }
});

export default app;
