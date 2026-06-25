import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "../middleware/auth.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { httpError } from "../lib/errors.js";
import { syncDb, dbMode, query } from "../db/client.js";
import type { Variables } from "../env.js";
import { SyncDeltaQuerySchema } from "@lumo/contracts";
import { getGcFloor } from "../lib/gc.js";
import { rowToTask } from "./tasks.js";
import { rowToEntry } from "./completed.js";
import { rowToPerson } from "./people.js";
import { rowToHabit } from "./habits.js";
import { rowToEvent } from "./countdowns.js";

const app = new Hono<{ Variables: Variables }>();
app.use("/*", authMiddleware);

const syncRateLimit = createRateLimiter<{ Variables: Variables }>(
  10, 60_000, (c) => c.get("userId") as string,
);

// ── Delta pull (ADR-0003 Phase 2) ────────────────────────────────────────────
// Server-authoritative incremental sync. Each syncable row carries a monotonic
// `seq` (migration triggers); this returns the authenticated user's rows changed
// since the cursor — INCLUDING tombstones (deleted_at set) so deletions
// propagate. The table list is a FIXED allowlist (never user input → no
// injection); table names are interpolated, so the soft-delete read-filter scan
// does not (and should not) flag these reads — the delta intentionally returns
// deleted rows.
const SYNC_DOMAINS: { key: string; table: string; map: (row: any) => unknown }[] = [
  { key: "tasks", table: "tasks", map: rowToTask },
  { key: "completed", table: "completed_entries", map: rowToEntry },
  { key: "people", table: "people", map: rowToPerson },
  { key: "habits", table: "habits", map: rowToHabit },
  { key: "countdowns", table: "countdown_events", map: rowToEvent },
];

app.get("/", syncRateLimit, zValidator("query", SyncDeltaQuerySchema), async (c) => {
  const userId = c.get("userId") as string;
  const { since, limit } = c.req.valid("query");

  // If the cursor is below the GC floor, pruned tombstones may have been missed
  // → tell the client to full-resync. (since=0 is already a full snapshot.)
  if (since > 0 && since < (await getGcFloor())) {
    return c.json({
      cursor: since,
      hasMore: false,
      resyncRequired: true,
      changes: { tasks: [], completed: [], people: [], habits: [], countdowns: [] },
    });
  }

  // Fetch up to limit+1 changed rows per domain (seq ascending), then merge by
  // the GLOBAL seq and keyset-paginate across all domains. The cursor is just a
  // seq value; every query is re-scoped to the authenticated user, so a forged
  // cursor can only ever read this user's own rows (no cross-tenant reach).
  const fetched: { key: string; seq: number; item: unknown }[] = [];
  for (const d of SYNC_DOMAINS) {
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM ${d.table} WHERE user_id = :uid AND seq > :since AND seq IS NOT NULL ORDER BY seq ASC LIMIT :lim`,
      { uid: userId, since, lim: limit + 1 },
    );
    for (const row of rows) {
      fetched.push({
        key: d.key,
        seq: row.seq as number,
        item: { ...(d.map(row) as object), deleted: row.deleted_at != null, seq: row.seq },
      });
    }
  }

  fetched.sort((a, b) => a.seq - b.seq);
  const hasMore = fetched.length > limit;
  const page = hasMore ? fetched.slice(0, limit) : fetched;
  const cursor = page.length ? page[page.length - 1].seq : since;

  const changes: Record<string, unknown[]> = {
    tasks: [], completed: [], people: [], habits: [], countdowns: [],
  };
  for (const f of page) changes[f.key].push(f.item);

  return c.json({ cursor, hasMore, changes });
});

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
