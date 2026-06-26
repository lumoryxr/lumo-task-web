import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { httpError } from "../lib/errors.js";
import { syncDb, dbMode } from "../db/client.js";
import type { Variables } from "../env.js";

// Embedded-replica controls (single-tenant, ADR-0004). Desktop runs the local
// SQLite file as a libSQL embedded replica of the user's own Turso DB; libSQL
// handles the bidirectional sync. These endpoints report status and let the UI
// trigger an immediate sync. No cross-device delta endpoint exists — each
// environment owns exactly one database.
const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

const syncRateLimit = createRateLimiter<{ Variables: Variables }>(
  10, 60_000, (c) => c.get("userId") as string,
);

let lastSyncAt: string | null = null;

app.get("/status", (c) => {
  const mode = dbMode();
  return c.json({
    mode,
    syncUrl: process.env.TURSO_SYNC_URL ?? null,
    lastSyncAt,
  });
});

app.post("/", syncRateLimit, async (c) => {
  const mode = dbMode();
  if (mode !== "replica") {
    return httpError(c, 400, "NOT_REPLICA", "Cloud sync is not enabled. Configure a Turso sync URL first.");
  }
  try {
    await syncDb();
    lastSyncAt = new Date().toISOString();
    return c.json({ ok: true, syncedAt: lastSyncAt });
  } catch (err) {
    console.error("[sync] failed:", err instanceof Error ? err.message : err);
    return httpError(c, 500, "SYNC_FAILED", "Sync failed. Check your Turso credentials.");
  }
});

export default app;
