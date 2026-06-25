import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
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

// NOTE (ADR-0003 Phase 5): the legacy manual remote-config / remote-sync
// endpoints and the hand-rolled app-level sync (lib/sync.ts) were removed.
// Cloud sync is now server-authoritative and automatic (incremental delta at
// GET /v1/sync); there is no per-user Turso URL to paste.

export default app;
