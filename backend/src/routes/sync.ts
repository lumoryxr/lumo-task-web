/**
 * API · Generic logical sync (ADR-0004 Addendum, 2026-06-26; P1a).
 *
 *   GET  /v1/sync/status  — report the DB mode (kept from the old endpoints).
 *   POST /v1/sync/pull    — per-entity rows changed since an HLC cursor (own rows only).
 *   POST /v1/sync/push    — per-entity LWW upserts of the caller's own rows.
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
import { SyncPullRequestSchema, SyncPushRequestSchema } from "@lumo/contracts";
import { MIN_HLC } from "../lib/hlc.js";
import { pull, push } from "../sync/engine.js";
import type { Variables } from "../env.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

// Sync calls move whole batches; keep a generous but bounded per-user budget.
const syncRateLimit = createRateLimiter<{ Variables: Variables }>(
  60, 60_000, (c) => c.get("userId") as string,
);

app.get("/status", (c) => {
  return c.json({ mode: dbMode() });
});

app.post("/pull", syncRateLimit, async (c) => {
  const userId = c.get("userId") as string;
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
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
