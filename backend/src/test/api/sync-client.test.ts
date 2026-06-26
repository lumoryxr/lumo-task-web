/**
 * API · Desktop sync client (P1b-core, ADR-0004 Addendum).
 *
 * Drives the LOCAL backend's sync client against a FAKE in-memory CloudClient —
 * the real cloud engine is already covered by P1a (sync.test.ts). The fake is a
 * minimal mirror of the engine: HLC row-level LWW keyed by id, forcing a FIXED
 * cloud user_id on push (proving identity mapping), returning rows since a cursor
 * on pull.
 *
 * AC→test map:
 *   AC1 — round-trip: local REST writes → cycle → fakeCloud holds them; fakeCloud
 *         rows → cycle → appear in LOCAL db stamped with the LOCAL user_id.
 *   AC3 — LWW: same id edited locally (t2) and in cloud (t1<t2) → local converges
 *         to t2 after a cycle, order-independent.
 *   AC4 — tombstone from cloud applies locally; older local value can't resurrect.
 *   AC5 — no-change cycle is a no-op (same cursors); a cloud.push throw sets
 *         last_error and does NOT advance pushCursor (safe retry).
 *   AC6 — after enableSync the stored token is encrypted; /status never leaks it.
 *   AC7 — enableSync with pre-existing local AND cloud rows → first reconcile is
 *         the LWW union on both sides.
 *   AC8 — migration idempotent (runMigrations twice).
 */
import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb } from "../helpers/index.js";
import { newUserWithToken } from "../helpers/auth.js";
import { now } from "../../lib/hlc.js";
import { runMigrations } from "../../db/migrate.js";
import { query } from "../../db/client.js";
import { isEncrypted } from "../../lib/crypto.js";
import { pull as enginePull, push as enginePush } from "../../sync/engine.js";
import type { CloudClient } from "../../sync/cloudClient.js";
import { CloudError } from "../../sync/cloudClient.js";
import {
  runSyncCycle,
  enableSync,
  disableSync,
  syncNow,
} from "../../sync/client.js";
import { getState } from "../../sync/clientState.js";
import type { SyncRow } from "@lumo/contracts";

const CLOUD_USER = "cloud-user-fixed";
const CLOUD_BASE = "https://cloud.test.local";

/**
 * In-memory CloudClient mirroring the engine: per-table id-keyed store, HLC LWW
 * on push (forcing a fixed cloud user_id), rows-since-cursor on pull. A
 * `failPush` toggle lets a test make `push` throw to exercise AC5.
 */
function makeFakeCloud() {
  const store = new Map<string, Map<string, SyncRow>>(); // table -> id -> row
  let failPush = false;

  function applied(table: string): Map<string, SyncRow> {
    let m = store.get(table);
    if (!m) {
      m = new Map();
      store.set(table, m);
    }
    return m;
  }

  const client: CloudClient = {
    async signin(email: string) {
      return { token: `cloud-token-for-${email}`, userId: CLOUD_USER };
    },
    async push(_token, entities) {
      if (failPush) throw new CloudError("forced push failure", 503);
      let count = 0;
      let cursor = "1970-01-01T00:00:00.000000Z";
      for (const [table, rows] of Object.entries(entities)) {
        const m = applied(table);
        for (const row of rows) {
          const id = String(row.id);
          const existing = m.get(id);
          // LWW: newer-or-equal HLC wins. Force the cloud user_id.
          if (!existing || String(row.updated_at) >= String(existing.updated_at)) {
            m.set(id, { ...row, user_id: CLOUD_USER });
            count += 1;
          }
          if (String(row.updated_at) > cursor) cursor = String(row.updated_at);
        }
      }
      return { applied: count, cursor };
    },
    async pull(_token, since) {
      const entities: Record<string, SyncRow[]> = {};
      let cursor = since;
      for (const [table, m] of store.entries()) {
        const out: SyncRow[] = [];
        for (const row of m.values()) {
          if (String(row.updated_at) > since) {
            out.push(row);
            if (String(row.updated_at) > cursor) cursor = String(row.updated_at);
          }
        }
        entities[table] = out;
      }
      return { entities, cursor };
    },
  };

  return {
    client,
    make: (_base: string) => client,
    seed(table: string, row: SyncRow) {
      applied(table).set(String(row.id), { ...row, user_id: CLOUD_USER });
    },
    get(table: string, id: string) {
      return store.get(table)?.get(id);
    },
    setFailPush(v: boolean) {
      failPush = v;
    },
  };
}

function countdownRow(id: string, title: string, updatedAt: string, extra: Record<string, unknown> = {}): SyncRow {
  return {
    id, user_id: "ignored", title, date: "2099-01-01", color: "green",
    repeat: "none", emoji: null, note: null, created_at: updatedAt,
    updated_at: updatedAt, deleted_at: null, ...extra,
  } as SyncRow;
}

let token = "";
let userId = "";

before(async () => {
  await setupDb();
});

beforeEach(async () => {
  ({ token, userId } = await newUserWithToken("sc"));
});

/** Create a task via the LOCAL REST API (the desktop's own backend). */
async function createTaskRest(title: string): Promise<string> {
  const res = await req("POST", "/v1/tasks", { token, body: { title: { en: title } } });
  assert.equal(res.status, 201);
  return res.body.id;
}

describe("AC1 · round-trip local↔cloud", () => {
  test("local REST writes reach the cloud; cloud rows land locally with LOCAL user_id", async () => {
    const fake = makeFakeCloud();
    const cloudToken = "cloud-token";
    // A local REST write:
    const localTaskId = await createTaskRest("Local task");

    // Seed a cloud-only countdown:
    const t = now();
    fake.seed("countdown_events", countdownRow("cloud-cd", "Cloud event", t));

    await runSyncCycle(userId, fake.client, cloudToken, { cloudBase: CLOUD_BASE });

    // PUSH: the cloud received the local task.
    const pushedTask = fake.get("tasks", localTaskId);
    assert.ok(pushedTask, "cloud should have received the local task");
    assert.equal(pushedTask!.user_id, CLOUD_USER, "cloud forces its own user_id");

    // PULL: the cloud countdown is now in the LOCAL db, stamped with LOCAL user_id.
    const rows = await query<{ id: string; user_id: string; title: string }>(
      "SELECT id, user_id, title FROM countdown_events WHERE id = :id",
      { id: "cloud-cd" },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, userId, "pulled row stamped with LOCAL user_id");
    assert.equal(rows[0].title, "Cloud event");
  });
});

describe("AC3 · LWW convergence (order-independent)", () => {
  async function lwwScenario(seedFirst: "local" | "cloud") {
    const fake = makeFakeCloud();
    const cloudToken = "tok";
    const id = `lww-${seedFirst}`;

    const t1 = now();
    const t2 = now(); // strictly later HLC
    assert.ok(t2 > t1);

    if (seedFirst === "cloud") {
      fake.seed("countdown_events", countdownRow(id, "cloud-older", t1));
      // local newer value via engine push (direct, simulating local edit at t2)
      await enginePush(userId, { countdown_events: [countdownRow(id, "local-newer", t2)] });
    } else {
      await enginePush(userId, { countdown_events: [countdownRow(id, "local-newer", t2)] });
      fake.seed("countdown_events", countdownRow(id, "cloud-older", t1));
    }

    await runSyncCycle(userId, fake.client, cloudToken);

    // Local converges to the t2 value.
    const local = await query<{ title: string }>(
      "SELECT title FROM countdown_events WHERE id = :id AND user_id = :u",
      { id, u: userId },
    );
    assert.equal(local[0]?.title, "local-newer", `local should win (${seedFirst} first)`);
    // Cloud also converges to t2.
    assert.equal(fake.get("countdown_events", id)?.title, "local-newer");
  }

  test("higher HLC wins when local seeded first", async () => {
    await lwwScenario("local");
  });
  test("higher HLC wins when cloud seeded first", async () => {
    await lwwScenario("cloud");
  });
});

describe("AC4 · tombstone propagation, no resurrection", () => {
  test("a cloud delete applies locally and an older local value can't revive it", async () => {
    const fake = makeFakeCloud();
    const id = "tomb-cd";

    const t1 = now(); // older local create
    await enginePush(userId, { countdown_events: [countdownRow(id, "alive", t1)] });

    const t2 = now(); // later cloud tombstone
    fake.seed("countdown_events", countdownRow(id, "alive", t2, { deleted_at: t2 }));

    await runSyncCycle(userId, fake.client, "tok");

    const rows = await query<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM countdown_events WHERE id = :id AND user_id = :u",
      { id, u: userId },
    );
    assert.ok(rows[0]?.deleted_at, "local row should now be tombstoned");

    // A second cycle with no newer local edit must NOT resurrect it.
    await runSyncCycle(userId, fake.client, "tok");
    const rows2 = await query<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM countdown_events WHERE id = :id AND user_id = :u",
      { id, u: userId },
    );
    assert.ok(rows2[0]?.deleted_at, "tombstone survives a second cycle");
  });
});

describe("AC5 · cursor advancement / safe retry", () => {
  test("a no-change cycle is a no-op returning the same cursors", async () => {
    const fake = makeFakeCloud();
    const r1 = await runSyncCycle(userId, fake.client, "tok");
    const r2 = await runSyncCycle(userId, fake.client, "tok");
    assert.equal(r2.pushed, 0);
    assert.equal(r2.pulled, 0);
    assert.equal(r2.pushCursor, r1.pushCursor);
    assert.equal(r2.pullCursor, r1.pullCursor);
  });

  test("a cloud.push failure sets last_error and does NOT advance pushCursor", async () => {
    const fake = makeFakeCloud();
    // Local has a row to push.
    await createTaskRest("Will fail to push");
    const before = await getState(userId);

    fake.setFailPush(true);
    await assert.rejects(
      () => runSyncCycle(userId, fake.client, "tok"),
      (e: unknown) => e instanceof CloudError,
    );

    const after = await getState(userId);
    assert.equal(after.pushCursor, before.pushCursor, "pushCursor must not advance on failure");
    assert.ok(after.lastError, "last_error recorded");

    // Recovery: clear the fault → next cycle succeeds and the row reaches cloud.
    fake.setFailPush(false);
    const r = await runSyncCycle(userId, fake.client, "tok");
    assert.ok(r.pushed >= 1, "row pushed on retry");
    const recovered = await getState(userId);
    assert.equal(recovered.lastError, null, "last_error cleared on success");
  });
});

describe("AC6 · credentials encrypted at rest, never leaked", () => {
  test("enableSync stores an encrypted token; /status never returns it", async () => {
    const fake = makeFakeCloud();
    const status = await enableSync(
      userId,
      { email: "user@test.local", password: "secret-pw-123", cloudBase: CLOUD_BASE },
      "local",
      fake.make,
    );
    assert.equal(status.enabled, true);
    // Stored token is ciphertext.
    const raw = await query<{ cloud_token: string }>(
      "SELECT cloud_token FROM sync_client_state WHERE user_id = :u",
      { u: userId },
    );
    assert.ok(isEncrypted(raw[0].cloud_token), "stored token must be enc:v1:");
    assert.ok(raw[0].cloud_token.startsWith("enc:v1:"));

    // GET /status (the real route) never returns a token field.
    const res = await req("GET", "/v1/sync/status", { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, true);
    assert.equal("cloud_token" in res.body, false);
    assert.equal("token" in res.body, false);
    assert.equal("cloudToken" in res.body, false);

    // disable clears it.
    await disableSync(userId, "local");
    const cleared = await getState(userId);
    assert.equal(cleared.enabled, false);
    assert.equal(cleared.cloudTokenEncrypted, null);
  });
});

describe("AC7 · first reconcile is the LWW union, no loss", () => {
  test("pre-existing local AND cloud rows both end up on both sides", async () => {
    const fake = makeFakeCloud();
    const t = now();

    // Pre-existing local row (via REST) and a distinct pre-existing cloud row.
    const localTaskId = await createTaskRest("Local-only");
    fake.seed("countdown_events", countdownRow("cloud-only", "Cloud-only", t));

    const status = await enableSync(
      userId,
      { email: "u2@test.local", password: "pw-123456", cloudBase: CLOUD_BASE },
      "local",
      fake.make,
    );
    assert.equal(status.enabled, true);
    assert.equal(status.lastError, null, "first reconcile succeeded");

    // Cloud now holds the local task.
    assert.ok(fake.get("tasks", localTaskId), "cloud has the local task");
    // Local now holds the cloud countdown.
    const local = await query<{ id: string; user_id: string }>(
      "SELECT id, user_id FROM countdown_events WHERE id = 'cloud-only'",
    );
    assert.equal(local.length, 1);
    assert.equal(local[0].user_id, userId);
  });
});

describe("AC8 · migration idempotent", () => {
  test("runMigrations twice succeeds and sync_client_state exists", async () => {
    await runMigrations();
    await runMigrations();
    const cols = await query<{ name: string }>("PRAGMA table_info(sync_client_state)");
    const names = cols.map((c) => c.name);
    for (const expected of [
      "user_id", "enabled", "cloud_base", "cloud_token",
      "push_cursor", "pull_cursor", "last_synced_at", "last_error",
    ]) {
      assert.ok(names.includes(expected), `column ${expected} present`);
    }
  });
});

describe("syncNow guards", () => {
  test("syncNow throws NOT_ENABLED when not bound", async () => {
    await assert.rejects(
      () => syncNow(userId),
      (e: unknown) => (e as { code?: string })?.code === "NOT_ENABLED",
    );
  });

  test("local rows are unaffected by disable (data stays)", async () => {
    const id = await createTaskRest("Stays local");
    await disableSync(userId, "local");
    const rows = await query("SELECT id FROM tasks WHERE id = :id", { id });
    assert.equal(rows.length, 1);
  });
});
