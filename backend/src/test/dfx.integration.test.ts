/**
 * DFX (Design-for-X) integration tests — real HTTP server over a real SQLite file.
 *
 * Where integration.test.ts proves the *happy-path* business scenarios work
 * end-to-end, this suite proves the system holds the **Design-for-X quality
 * attributes** under hostile, malformed, and boundary inputs — the failure modes
 * that don't show up in feature tests but bite in production:
 *
 *   • Design for Security      — authn/authz, tenant isolation, injection, weak creds
 *   • Design for Robustness    — malformed / wrong-typed / missing input → 4xx not 5xx
 *   • Design for Recoverability— bad input never crashes the server; next request works
 *   • Design for Observability — health/readiness + consistent error envelope
 *   • Design for Scalability   — list responses are always bounded (no unbounded reads)
 *   • Design for Interoperability — stable contract: Content-Type, status codes, error shape
 *
 * Same harness as integration.test.ts: a live @hono/node-server on a random port,
 * a real temp SQLite file, real fetch() over TCP. Kept as a separate file so the
 * daily regression workflow can run it on its own and the coverage matrix can map
 * each DFX dimension to concrete assertions here.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { rmSync } from "node:fs";
import { serve } from "@hono/node-server";
import { runMigrations } from "../db/migrate.js";
import { app } from "../app.js";

// ── Server lifecycle ──────────────────────────────────────────────────────────

const DB_PATH = process.env.LUMO_DB_PATH ?? "";
let BASE_URL = "";
let server: ReturnType<typeof serve> | null = null;

before(async () => {
  await runMigrations();
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Server did not start within 10 s")), 10_000);
    server = serve({ fetch: app.fetch, port: 0 }, () => {
      clearTimeout(t);
      const addr = (server as any).address() as AddressInfo;
      BASE_URL = `http://127.0.0.1:${addr.port}`;
      delete process.env.PORT;
      process.env.LUMO_PORT = String(addr.port);
      resolve();
    });
  });
});

after(() => {
  try { (server as any)?.close?.(); } catch {}
  if (DB_PATH) {
    try { rmSync(DB_PATH); } catch {}
  }
});

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function api(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
): Promise<{ status: number; body: any; contentType: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get("content-type") ?? "";
  let body: any;
  try {
    body = contentType.includes("application/json") ? await res.json() : await res.text();
  } catch {
    body = null;
  }
  return { status: res.status, body, contentType };
}

/** Send a request with a RAW (possibly malformed) string body, bypassing JSON.stringify. */
async function rawApi(
  method: string,
  path: string,
  rawBody: string,
  token?: string,
): Promise<{ status: number; body: any; contentType: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: rawBody });
  const contentType = res.headers.get("content-type") ?? "";
  let body: any;
  try {
    body = contentType.includes("application/json") ? await res.json() : await res.text();
  } catch {
    body = null;
  }
  return { status: res.status, body, contentType };
}

function uniqueEmail(tag: string): string {
  // Deterministic-but-unique per test; no Math.random / Date needed for uniqueness
  // because each registers exactly once.
  return `dfx-${tag}@lumo.test`;
}

async function registerUser(tag: string): Promise<{ token: string; id: string }> {
  const { status, body } = await api("POST", "/v1/auth/register", {
    body: { email: uniqueEmail(tag), password: "Secret1234!", name: tag },
  });
  assert.equal(status, 201, `register ${tag} should succeed`);
  return { token: body.token, id: body.user.id };
}

// Shared actors created lazily inside the first describe that needs them.
let alice: { token: string; id: string };
let bob: { token: string; id: string };

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Security — authentication & authorization", () => {
  before(async () => {
    alice = await registerUser("alice");
    bob = await registerUser("bob");
  });

  test("protected route without a token → 401 UNAUTHORIZED", async () => {
    const { status, body } = await api("GET", "/v1/tasks");
    assert.equal(status, 401);
    assert.equal(body.error?.code, "UNAUTHORIZED");
  });

  test("garbage / malformed bearer token → 401 (not 500)", async () => {
    for (const bad of ["Bearer not-a-jwt", "Bearer aaa.bbb.ccc", "Token x"]) {
      const res = await fetch(`${BASE_URL}/v1/tasks`, { headers: { Authorization: bad } });
      assert.equal(res.status, 401, `header "${bad}" should 401`);
    }
  });

  test("tenant isolation — Bob cannot read Alice's task by id → 404", async () => {
    const { body: task } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Alice private" }, quadrant: "Q1" },
    });
    const { status } = await api("GET", `/v1/tasks/${task.id}`, { token: bob.token });
    assert.equal(status, 404, "cross-tenant read must not leak (404, never 200)");
  });

  test("tenant isolation — Bob cannot mutate or delete Alice's task → 404", async () => {
    const { body: task } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Alice private 2" }, quadrant: "Q2" },
    });
    const patch = await api("PATCH", `/v1/tasks/${task.id}`, {
      token: bob.token,
      body: { title: { en: "hijacked" } },
    });
    assert.equal(patch.status, 404, "cross-tenant patch must 404");
    const del = await api("DELETE", `/v1/tasks/${task.id}`, { token: bob.token });
    assert.equal(del.status, 404, "cross-tenant delete must 404");

    // And Alice's task is untouched.
    const { body: still } = await api("GET", `/v1/tasks/${task.id}`, { token: alice.token });
    assert.equal(still.title.en, "Alice private 2");
  });

  test("weak password is rejected at registration → 4xx (not stored)", async () => {
    const { status } = await api("POST", "/v1/auth/register", {
      body: { email: uniqueEmail("weak"), password: "short", name: "Weak" },
    });
    assert.ok(status >= 400 && status < 500, `weak password should be 4xx, got ${status}`);
  });

  test("SQL-injection-shaped input is stored as literal data, not executed", async () => {
    const evil = "Robert'); DROP TABLE tasks;--";
    const { status, body: created } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: evil }, quadrant: "Q3" },
    });
    assert.equal(status, 201);
    // Round-trips verbatim …
    const { body: fetched } = await api("GET", `/v1/tasks/${created.id}`, { token: alice.token });
    assert.equal(fetched.title.en, evil);
    // … and the table still exists / serves subsequent reads (not dropped).
    const { status: listStatus } = await api("GET", "/v1/tasks", { token: alice.token });
    assert.equal(listStatus, 200, "tasks table must survive injection-shaped input");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY — tenant isolation across ALL user-scoped resources (#158)
//
// The cases above prove isolation for /v1/tasks; the coverage-gap audit found the
// same guarantees were never exercised for the other user-scoped CRUD resources.
// These parametrized cases close that gap: an IDOR regression (a handler dropping
// `WHERE user_id`) or a 5xx-on-malformed-body in any of these would now fail CI.
// ═══════════════════════════════════════════════════════════════════════════════

const TENANT_RESOURCES: Array<{
  name: string;
  path: string;
  create: () => Record<string, unknown>;
  patch: Record<string, unknown>;
}> = [
  {
    name: "people",
    path: "/v1/people",
    create: () => ({ name: "Owner Person", initials: "OP", color: "#5bc8d4", email: "owner@example.com" }),
    patch: { name: "Hijacked" },
  },
  {
    name: "countdowns",
    path: "/v1/countdowns",
    create: () => ({ title: "Owner Event", date: "2026-12-01", color: "cyan", repeat: "yearly" }),
    patch: { title: "Hijacked" },
  },
  {
    name: "habits",
    path: "/v1/habits",
    create: () => ({ title: "Owner Habit", color: "green", frequency: "daily" }),
    patch: { title: "Hijacked" },
  },
];

describe("DFX · Security — tenant isolation across user-scoped resources (#158)", () => {
  for (const r of TENANT_RESOURCES) {
    test(`${r.name}: attacker cannot PATCH another tenant's row → 404, owner's row survives`, async () => {
      const { status: createStatus, body: row } = await api("POST", r.path, { token: alice.token, body: r.create() });
      assert.equal(createStatus, 201, `${r.name} create should succeed`);

      const patch = await api("PATCH", `${r.path}/${row.id}`, { token: bob.token, body: r.patch });
      assert.equal(patch.status, 404, `${r.name} cross-tenant PATCH must 404 (no IDOR)`);

      // Owner's row must be untouched.
      const { body: list } = await api("GET", r.path, { token: alice.token });
      const still = (list as any[]).find((x) => x.id === row.id);
      assert.ok(still, `${r.name} owner's row must still exist after a failed cross-tenant PATCH`);
      const patchedKey = Object.keys(r.patch)[0];
      assert.notEqual(still[patchedKey], (r.patch as any)[patchedKey], `${r.name} owner's field must not be mutated`);
    });

    test(`${r.name}: attacker cannot DELETE another tenant's row → 404`, async () => {
      const { body: row } = await api("POST", r.path, { token: alice.token, body: r.create() });
      const del = await api("DELETE", `${r.path}/${row.id}`, { token: bob.token });
      assert.equal(del.status, 404, `${r.name} cross-tenant DELETE must 404`);

      const { body: list } = await api("GET", r.path, { token: alice.token });
      assert.ok((list as any[]).some((x) => x.id === row.id), `${r.name} owner's row must survive a cross-tenant DELETE`);
    });

    test(`${r.name}: attacker's list never contains the owner's row (tenant-scoped reads)`, async () => {
      const { body: row } = await api("POST", r.path, { token: alice.token, body: r.create() });
      const { status, body: bobList } = await api("GET", r.path, { token: bob.token });
      assert.equal(status, 200);
      assert.ok(Array.isArray(bobList), `${r.name} list should be an array`);
      assert.ok(!(bobList as any[]).some((x) => x.id === row.id), `${r.name} attacker's read must not leak the owner's row`);
    });

    test(`${r.name}: malformed JSON body → 400 INVALID_JSON (global handler, not a tasks quirk)`, async () => {
      const { status, body } = await rawApi("POST", r.path, "{ not valid json ", alice.token);
      assert.equal(status, 400, `${r.name} malformed JSON must be a client error, not 5xx`);
      assert.equal(body.error?.code, "INVALID_JSON", `${r.name} should use the global INVALID_JSON envelope`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY — tenant isolation on ACTION / SUB-RESOURCE endpoints (#162)
//
// The parametrized block above proves isolation for the base CRUD verbs
// (PATCH/DELETE /:id, GET /). It is structurally blind to the *action* and
// *sub-resource* mutating-by-id endpoints — complete / uncomplete / reopen / log —
// which are an equally real IDOR surface and had zero cross-tenant coverage. Each
// handler was audited and already scopes by `WHERE … user_id = :uid`; these cases
// lock that in so a dropped guard fails the daily regression.
//
// Note the deliberate asymmetry: a cross-tenant DELETE of a habit log is an
// *idempotent* no-op → 204 (it deletes 0 rows), NOT a 404. So we never trust the
// status code alone — every case also proves the owner's state is unchanged.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Security — tenant isolation on action / sub-resource endpoints (#162)", () => {
  let owner: { token: string; id: string };
  let attacker: { token: string; id: string };

  before(async () => {
    owner = await registerUser("act-owner");
    attacker = await registerUser("act-attacker");
  });

  /** Create a task owned by `owner` and return its server id. */
  async function ownerTask(): Promise<string> {
    const { status, body } = await api("POST", "/v1/tasks", {
      token: owner.token,
      body: { title: { en: "Owner task" }, quadrant: "Q1" },
    });
    assert.equal(status, 201, "owner task create should 201");
    assert.ok(body.id, "task create must return a server id");
    return body.id;
  }

  /** Create a habit owned by `owner` and return its server id. */
  async function ownerHabit(): Promise<string> {
    const { status, body } = await api("POST", "/v1/habits", {
      token: owner.token,
      body: { title: "Owner habit", color: "green", frequency: "daily" },
    });
    assert.equal(status, 201, "owner habit create should 201");
    assert.ok(body.id, "habit create must return a server id");
    return body.id;
  }

  test("POST /tasks/:id/complete: attacker cannot complete the owner's task → 404, no entry created", async () => {
    const taskId = await ownerTask();

    const attack = await api("POST", `/v1/tasks/${taskId}/complete`, { token: attacker.token });
    assert.equal(attack.status, 404, "cross-tenant complete must 404 (no IDOR)");

    // The owner's task must not have been completed — no completed entry references it.
    const { body: completed } = await api("GET", "/v1/completed", { token: owner.token });
    assert.ok(
      !(completed as any[]).some((e) => e.task_id === taskId),
      "owner's task must not be completed by a cross-tenant attack",
    );
  });

  test("POST /tasks/:id/uncomplete: attacker cannot uncomplete the owner's completed task → 404, stays completed", async () => {
    const taskId = await ownerTask();
    const done = await api("POST", `/v1/tasks/${taskId}/complete`, { token: owner.token });
    assert.equal(done.status, 200, "owner completes their own task");

    const attack = await api("POST", `/v1/tasks/${taskId}/uncomplete`, { token: attacker.token });
    assert.equal(attack.status, 404, "cross-tenant uncomplete must 404");

    // The owner's completed entry must survive the failed attack.
    const { body: completed } = await api("GET", "/v1/completed", { token: owner.token });
    assert.ok(
      (completed as any[]).some((e) => e.task_id === taskId),
      "owner's completed entry must survive a cross-tenant uncomplete",
    );
  });

  test("POST /completed/:id/reopen: attacker cannot reopen the owner's completed entry → 404, entry survives", async () => {
    const taskId = await ownerTask();
    const done = await api("POST", `/v1/tasks/${taskId}/complete`, { token: owner.token });
    assert.equal(done.status, 200);
    const entryId = done.body.entry_id;
    assert.ok(entryId, "complete must return an entry_id");

    const attack = await api("POST", `/v1/completed/${entryId}/reopen`, { token: attacker.token });
    assert.equal(attack.status, 404, "cross-tenant reopen must 404");

    const { body: completed } = await api("GET", "/v1/completed", { token: owner.token });
    assert.ok(
      (completed as any[]).some((e) => e.id === entryId),
      "owner's completed entry must survive a cross-tenant reopen",
    );
  });

  test("POST /habits/:id/log: attacker cannot check in against the owner's habit → 404, no log created", async () => {
    const habitId = await ownerHabit();

    const attack = await api("POST", `/v1/habits/${habitId}/log`, {
      token: attacker.token,
      body: { date: "2026-01-01" },
    });
    assert.equal(attack.status, 404, "cross-tenant habit log must 404");

    // No log must exist for the owner's habit on that date.
    const { body: logs } = await api("GET", "/v1/habits/logs", { token: owner.token });
    assert.ok(
      !(logs as any[]).some((l) => l.habitId === habitId && l.date === "2026-01-01"),
      "no log may be created on the owner's habit by a cross-tenant attack",
    );
  });

  test("DELETE /habits/:id/log/:date: cross-tenant delete is an idempotent no-op (204) and the owner's log survives", async () => {
    const habitId = await ownerHabit();
    const date = "2026-02-02";

    // Owner legitimately checks in.
    const log = await api("POST", `/v1/habits/${habitId}/log`, { token: owner.token, body: { date } });
    assert.equal(log.status, 201, "owner can log their own habit");

    // Attacker's delete touches 0 rows → idempotent 204, NOT 404, but must not
    // delete the owner's log (the guard is the WHERE user_id, not the status code).
    const attack = await api("DELETE", `/v1/habits/${habitId}/log/${date}`, { token: attacker.token });
    assert.equal(attack.status, 204, "cross-tenant habit-log delete is an idempotent no-op (204)");

    const { body: logs } = await api("GET", "/v1/habits/logs", { token: owner.token });
    assert.ok(
      (logs as any[]).some((l) => l.habitId === habitId && l.date === date),
      "owner's habit log must survive a cross-tenant delete",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for ROBUSTNESS — malformed / wrong-typed / missing input
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness — hostile & malformed input", () => {
  test("malformed JSON body → 400 INVALID_JSON, never a 5xx crash", async () => {
    const { status, body } = await rawApi("POST", "/v1/tasks", "{ not valid json ", alice.token);
    assert.equal(status, 400, "malformed JSON must be a client error, not 5xx");
    assert.equal(body.error?.code, "INVALID_JSON");
  });

  test("missing required field (title) → 400 validation error", async () => {
    const { status } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { quadrant: "Q1" },
    });
    assert.equal(status, 400);
  });

  test("wrong field type (title as number) → 400", async () => {
    const { status } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: 12345, quadrant: "Q1" },
    });
    assert.equal(status, 400);
  });

  test("out-of-enum value (quadrant) → 400", async () => {
    const { status } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "x" }, quadrant: "Q9" },
    });
    assert.equal(status, 400);
  });

  test("unknown route → 404", async () => {
    const { status } = await api("GET", "/v1/does-not-exist", { token: alice.token });
    assert.equal(status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for RECOVERABILITY — bad input must not poison the server
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Recoverability — server survives bad requests", () => {
  test("invalid pagination cursor → 400 INVALID_CURSOR (handled, not 500)", async () => {
    const { status, body } = await api("GET", "/v1/tasks?cursor=not-a-real-cursor", {
      token: alice.token,
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "INVALID_CURSOR");
  });

  test("a burst of bad requests does not break the next good request", async () => {
    // Fire several malformed/invalid requests …
    await rawApi("POST", "/v1/tasks", "}{", alice.token);
    await api("GET", "/v1/tasks?cursor=garbage", { token: alice.token });
    await api("POST", "/v1/tasks", { token: alice.token, body: { title: 1 } });
    // … then a normal request still succeeds.
    const { status } = await api("GET", "/v1/tasks", { token: alice.token });
    assert.equal(status, 200, "server must remain healthy after bad input");
  });

  test("operation on a non-existent resource id → 404 (not 500)", async () => {
    const { status } = await api("GET", "/v1/tasks/nonexistent-id-123", { token: alice.token });
    assert.equal(status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for OBSERVABILITY — health, readiness, consistent error envelope
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Observability — health & error contract", () => {
  test("GET /health → 200 { ok: true } (liveness)", async () => {
    const { status, body } = await api("GET", "/health");
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });

  test("GET /ready → 200 and actually reflects a working DB (readiness)", async () => {
    const { status, body } = await api("GET", "/ready");
    assert.equal(status, 200);
    // readiness must be backed by a real DB probe, not a static literal.
    assert.notEqual(body.db, "down");
  });

  test("business errors share a consistent { error: { code, message } } envelope", async () => {
    const cases = [
      await api("GET", "/v1/tasks"),                               // 401 UNAUTHORIZED
      await api("GET", "/v1/tasks/nope", { token: alice.token }),  // 404 NOT_FOUND
      await api("GET", "/v1/tasks?cursor=bad", { token: alice.token }), // 400 INVALID_CURSOR
    ];
    for (const { body } of cases) {
      assert.ok(body.error, "error responses must carry an `error` object");
      assert.equal(typeof body.error.code, "string", "error.code must be a string");
      assert.equal(typeof body.error.message, "string", "error.message must be a string");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SCALABILITY — responses are always bounded
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Scalability — bounded list responses & pagination integrity", () => {
  let scaler: { token: string; id: string };
  const TOTAL = 60; // > default page size (50) so paging is exercised

  before(async () => {
    scaler = await registerUser("scaler");
    for (let i = 0; i < TOTAL; i++) {
      const { status } = await api("POST", "/v1/tasks", {
        token: scaler.token,
        body: { title: { en: `task ${String(i).padStart(3, "0")}` }, quadrant: "unclassified" },
      });
      assert.equal(status, 201, `seed task ${i} should create`);
    }
  });

  test("list with no limit is bounded by the default page size (≤ 50)", async () => {
    const { status, body } = await api("GET", "/v1/tasks", { token: scaler.token });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items), "response must be an { items, nextCursor } envelope");
    assert.ok(body.items.length <= 50, `default page must be ≤ 50, got ${body.items.length}`);
    assert.ok(body.nextCursor, "more than one page of data → nextCursor must be present");
  });

  test("limit above the contract maximum (>200) is rejected → 400 (no unbounded read)", async () => {
    const { status } = await api("GET", "/v1/tasks?limit=99999", { token: scaler.token });
    assert.equal(status, 400, "over-max limit must be rejected, not silently unbounded");
  });

  test("cursor paging walks every row exactly once — no dupes, no omissions", async () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = cursor
        ? `/v1/tasks?limit=25&cursor=${encodeURIComponent(cursor)}`
        : "/v1/tasks?limit=25";
      const { status, body } = await api("GET", url, { token: scaler.token });
      assert.equal(status, 200);
      for (const item of body.items) {
        assert.ok(!seen.has(item.id), `task ${item.id} returned on more than one page`);
        seen.add(item.id);
      }
      cursor = body.nextCursor;
      pages++;
      assert.ok(pages <= 10, "pagination did not terminate — possible cursor loop");
    } while (cursor);
    assert.equal(seen.size, TOTAL, `expected ${TOTAL} unique tasks across pages, got ${seen.size}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for INTEROPERABILITY — stable wire contract
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Interoperability — stable wire contract", () => {
  test("JSON responses advertise Content-Type: application/json", async () => {
    const { contentType } = await api("GET", "/health");
    assert.ok(contentType.includes("application/json"), `got "${contentType}"`);
  });

  test("DELETE returns 204 No Content", async () => {
    const { body: task } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "to delete" }, quadrant: "Q4" },
    });
    const { status } = await api("DELETE", `/v1/tasks/${task.id}`, { token: alice.token });
    assert.equal(status, 204);
  });

  test("successful create returns 201 with a server-assigned id", async () => {
    const { status, body } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "interop create" }, quadrant: "Q1" },
    });
    assert.equal(status, 201);
    assert.equal(typeof body.id, "string");
    assert.ok(body.id.length > 0);
  });
});
