import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { httpError } from "../lib/errors.js";
import { getSyncStatus, triggerSync, stopSync, initSync, appLevelSyncAllowed } from "../lib/sync.js";
import { queryOne, execute, dbMode } from "../db/client.js";
import { encryptSecret } from "../lib/crypto.js";
import { assertSafeOutboundUrl, SsrfError } from "../lib/ssrf.js";
import type { Variables } from "../env.js";
import fs from "node:fs";
import path from "node:path";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

app.get("/info", (c) => {
  const dbPath = process.env.LUMO_DB_PATH ?? path.join(process.cwd(), "lumo.db");
  let dbSize = 0;
  try {
    const stat = fs.statSync(dbPath);
    dbSize = stat.size;
  } catch {
    // DB might not exist yet during first run
  }
  return c.json({
    dbPath,
    dbDir: path.dirname(dbPath),
    dbSize,
    dbName: path.basename(dbPath),
  });
});

// GET /storage/remote-status
app.get("/remote-status", async (c) => {
  const userId = c.get("userId") as string;
  const row = await queryOne<{ remote_url: string | null }>(
    "SELECT remote_url FROM settings WHERE user_id = :uid",
    { uid: userId }
  );
  const { status, error, lastSyncAt } = getSyncStatus();
  const envUrl = (process.env.LUMO_REMOTE_URL ?? "").trim();
  return c.json({
    configured: Boolean(row?.remote_url || envUrl),
    remoteUrl: envUrl || (row?.remote_url ?? ""),
    status,
    error,
    lastSyncAt,
  });
});

const RemoteConfigBody = z.object({
  remoteUrl: z.string().url().max(500).or(z.literal("")).optional(),
  remoteToken: z.string().max(500).optional(),
});

// PATCH /storage/remote-config — save remote URL + token, restart sync
app.patch("/remote-config", zValidator("json", RemoteConfigBody), async (c) => {
  const userId = c.get("userId") as string;
  const { remoteUrl, remoteToken } = c.req.valid("json");

  // The app-level sync is single-tenant only (it copies every row, unscoped, to
  // the remote). Refuse to enable it on a shared multi-tenant backend before we
  // even store the token — otherwise one user's sync would leak all tenants'
  // data. Checked first so no outbound connection is attempted and no secret is
  // persisted on a shared deployment.
  if (remoteUrl && !(await appLevelSyncAllowed())) {
    return httpError(
      c,
      409,
      "SYNC_MULTITENANT_DISABLED",
      "Cloud sync via remote-config is unavailable on a shared multi-tenant backend.",
    );
  }

  // SSRF guard: the server opens a libSQL connection to this URL. Restrict to
  // remote DB schemes (block file: and internal/loopback/metadata hosts in
  // hosted mode); desktop mode may target a LAN replica.
  if (remoteUrl) {
    try {
      await assertSafeOutboundUrl(remoteUrl, dbMode() !== "cloud", new Set(["https:", "libsql:", "wss:"]));
    } catch (e) {
      if (e instanceof SsrfError) return httpError(c, 400, "INVALID_REMOTE_URL", e.message);
      throw e;
    }
  }

  const existing = await queryOne("SELECT user_id FROM settings WHERE user_id = :uid", { uid: userId });
  if (!existing) return httpError(c, 404, "NOT_FOUND", "Settings not found");

  await execute(
    "UPDATE settings SET remote_url = :url, remote_token = :token WHERE user_id = :uid",
    { url: remoteUrl ?? null, token: remoteToken ? encryptSecret(remoteToken) : null, uid: userId }
  );

  stopSync();
  if (remoteUrl) await initSync();

  const { status, error, lastSyncAt } = getSyncStatus();
  return c.json({ ok: true, status, error, lastSyncAt });
});

// POST /storage/remote-sync — manual sync trigger
app.post("/remote-sync", async (c) => {
  const result = await triggerSync();
  if (!result.ok) return httpError(c, 503, "SYNC_ERROR", result.error ?? "sync failed");
  return c.json({ ok: true, lastSyncAt: getSyncStatus().lastSyncAt });
});

export default app;
