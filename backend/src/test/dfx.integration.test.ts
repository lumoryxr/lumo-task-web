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
import { createServer, type Server } from "node:http";
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
  {
    // Templates (#173) were added after the original isolation sweep (#158/#160),
    // so the matrix never exercised them. The payload uses schema defaults so the
    // create body stays minimal.
    name: "templates",
    path: "/v1/templates",
    create: () => ({ name: "Owner Template", payload: { title: { en: "Owner Template" } } }),
    patch: { name: "Hijacked" },
  },
  {
    name: "projects",
    path: "/v1/projects",
    create: () => ({ name: "Owner Project", category: "Work", color: "cyan" }),
    patch: { name: "Hijacked" },
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
// Design for SECURITY — tenant isolation on state-changing SUB-RESOURCE endpoints (#165)
//
// The #158 cases cover CRUD-by-id (PATCH/DELETE /:id). They do NOT cover the
// id-addressed, state-changing sub-resource endpoints — the classic IDOR surface:
//   • POST   /v1/completed/:id/reopen   (un-complete by entry id)        — #165
//   • POST   /v1/habits/:id/log         (check-in)                       — #165
//   • DELETE /v1/habits/:id/log/:date   (un-check-in — idempotent 204!)  — #165
//   • POST   /v1/tasks/:id/complete     (complete by task id)            — #194
//   • POST   /v1/tasks/:id/uncomplete   (un-complete by task id)         — #194
// A dropped `WHERE user_id` on any of these is an IDOR. The un-check-in case is
// especially insidious: it returns 204 even when nothing matches, so a regression
// would leak SILENTLY — only the "owner's row survives" assertion catches it.
// `tasks/:id/complete` is the highest-impact of these: a regression would not only
// flip the owner's task state but also write a completed-log entry (and spawn a new
// recurrence) under the wrong tenant's scope.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Security — tenant isolation on state-changing sub-resource endpoints (#165)", () => {
  let owner: { token: string; id: string };
  let attacker: { token: string; id: string };
  before(async () => {
    owner = await registerUser("sub-owner");
    attacker = await registerUser("sub-attacker");
  });

  test("completed/reopen: attacker cannot reopen another tenant's completed entry → 404; owner's entry survives", async () => {
    // Owner creates + completes a task, producing a completed entry.
    const { body: task } = await api("POST", "/v1/tasks", {
      token: owner.token,
      body: { title: { en: "Owner finished" }, quadrant: "Q1" },
    });
    const comp = await api("POST", `/v1/tasks/${task.id}/complete`, { token: owner.token });
    assert.ok(comp.status >= 200 && comp.status < 300, "owner can complete own task");

    // GET /completed (no ?date) is the paginated full-history shape: { items, nextCursor } (#164).
    const { body: entries } = await api("GET", "/v1/completed", { token: owner.token });
    const entry = ((entries as any).items as any[]).find((e) => e.task_id === task.id);
    assert.ok(entry, "owner has a completed entry to target");

    // Attacker tries to reopen the owner's entry by its id.
    const res = await api("POST", `/v1/completed/${entry.id}/reopen`, { token: attacker.token });
    assert.equal(res.status, 404, "cross-tenant reopen must 404 (no IDOR)");

    // Owner's entry must still exist (not tombstoned by the attacker).
    const { body: after } = await api("GET", "/v1/completed", { token: owner.token });
    assert.ok(
      ((after as any).items as any[]).some((e) => e.id === entry.id),
      "owner's completed entry must survive a cross-tenant reopen",
    );
  });

  test("habits check-in: attacker cannot log a check-in on another tenant's habit → 404; no log written", async () => {
    const { body: habit } = await api("POST", "/v1/habits", {
      token: owner.token,
      body: { title: "Owner Habit", color: "green", frequency: "daily" },
    });
    const date = "2026-06-20";

    const res = await api("POST", `/v1/habits/${habit.id}/log`, { token: attacker.token, body: { date } });
    assert.equal(res.status, 404, "cross-tenant check-in must 404 (no IDOR)");

    // No log should exist for that habit/date under either tenant.
    const ownerLogs = await api("GET", "/v1/habits/logs", { token: owner.token });
    assert.ok(
      !(ownerLogs.body as any[]).some((l) => l.habitId === habit.id && l.date === date),
      "no check-in should have been written to the owner's habit",
    );
    const attackerLogs = await api("GET", "/v1/habits/logs", { token: attacker.token });
    assert.ok(
      !(attackerLogs.body as any[]).some((l) => l.habitId === habit.id),
      "attacker must not hold a log referencing the owner's habit",
    );
  });

  test("habits un-check-in: attacker's delete of another tenant's check-in is a no-op → owner's log survives (silent-IDOR guard)", async () => {
    const { body: habit } = await api("POST", "/v1/habits", {
      token: owner.token,
      body: { title: "Owner Streak", color: "cyan", frequency: "daily" },
    });
    const date = "2026-06-21";
    const checkIn = await api("POST", `/v1/habits/${habit.id}/log`, { token: owner.token, body: { date } });
    assert.equal(checkIn.status, 201, "owner can check in own habit");

    // The endpoint is idempotent (204 even when nothing matches), so a dropped
    // `WHERE user_id` would be a SILENT IDOR — only the survival check below catches it.
    const del = await api("DELETE", `/v1/habits/${habit.id}/log/${date}`, { token: attacker.token });
    assert.equal(del.status, 204, "idempotent un-check-in returns 204");

    const ownerLogs = await api("GET", "/v1/habits/logs", { token: owner.token });
    assert.ok(
      (ownerLogs.body as any[]).some((l) => l.habitId === habit.id && l.date === date),
      "owner's check-in must survive a cross-tenant delete (no silent IDOR)",
    );
  });

  // `POST /v1/focus/sessions` is the same sub-resource IDOR class the #165 sweep
  // covered — it writes (a completed_entries row + the task's pomos_done) keyed by
  // a caller-supplied task_id — but was MISSED there (#190). It is the most
  // insidious of the set: a cross-tenant task_id is silently skipped and the
  // endpoint still returns 200 {ok:true}, so a dropped scope leaks with NO
  // status-code change. Only a state-survival assertion (owner's pomos_done
  // unchanged + no leaked completed entry) catches it.
  test("focus/sessions: attacker recording a session against another tenant's task is a no-op → owner's pomos_done unchanged, no entry leaked (silent-IDOR guard, #190)", async () => {
    const { body: task } = await api("POST", "/v1/tasks", {
      token: owner.token,
      body: { title: { en: "Owner deep work" }, quadrant: "Q1", pomos_total: 3 },
    });
    assert.equal(task.pomos_done, 0, "owner's task starts at 0 pomos");

    // Attacker posts a focus session referencing the owner's task by id. The
    // endpoint does NOT 404 on a cross-tenant id — it silently no-ops and still
    // returns 200. That silence is exactly why the survival assertions matter.
    const res = await api("POST", "/v1/focus/sessions", {
      token: attacker.token,
      body: { task_id: task.id, duration: 25 },
    });
    assert.equal(res.status, 200, "cross-tenant focus session degrades gracefully (no 5xx)");

    // AC1: the owner's pomos_done must NOT have been incremented.
    const { body: afterTask } = await api("GET", `/v1/tasks/${task.id}`, { token: owner.token });
    assert.equal(afterTask.pomos_done, 0, "owner's pomos_done must not move on a cross-tenant focus session (no IDOR)");

    // AC2: no completed entry referencing the owner's task may exist under either
    // tenant (GET /completed with no ?date is the { items, nextCursor } shape, #164).
    const ownerCompleted = await api("GET", "/v1/completed", { token: owner.token });
    assert.ok(
      !((ownerCompleted.body as any).items as any[]).some((e) => e.task_id === task.id),
      "no completed entry for the owner's task should exist",
    );
    const attackerCompleted = await api("GET", "/v1/completed", { token: attacker.token });
    assert.ok(
      !((attackerCompleted.body as any).items as any[]).some((e) => e.task_id === task.id),
      "attacker must not hold a completed entry referencing the owner's task",
    );
  });

  test("tasks/complete: attacker cannot complete another tenant's task → 404; owner's task stays open, no completed entry written (#194)", async () => {
    const { body: task } = await api("POST", "/v1/tasks", {
      token: owner.token,
      body: { title: { en: "Owner open task" }, quadrant: "Q1" },
    });

    const res = await api("POST", `/v1/tasks/${task.id}/complete`, { token: attacker.token });
    assert.equal(res.status, 404, "cross-tenant complete must 404 (no IDOR)");

    // The owner's task must still be incomplete (a dropped WHERE user_id would have flipped it).
    const { body: ownerTask } = await api("GET", `/v1/tasks/${task.id}`, { token: owner.token });
    assert.equal(ownerTask.completed, false, "owner's task must not have been completed by the attacker");

    // No completed-log entry must have been spawned for that task — under either tenant.
    const { body: ownerCompleted } = await api("GET", "/v1/completed", { token: owner.token });
    assert.ok(
      !((ownerCompleted as any).items as any[]).some((e) => e.task_id === task.id),
      "no completed entry should exist for the owner's still-open task",
    );
    const { body: attackerCompleted } = await api("GET", "/v1/completed", { token: attacker.token });
    assert.ok(
      !((attackerCompleted as any).items as any[]).some((e) => e.task_id === task.id),
      "attacker must not hold a completed entry referencing the owner's task",
    );
  });

  // `POST /v1/ai/breakdown` is another caller-supplied-`taskId` IDOR surface that
  // the #165/#190 sub-resource sweep never reached (it lives under /v1/ai, not the
  // CRUD/sub-resource routes). It loads the referenced task to feed its title/desc
  // into the LLM prompt, so a dropped `WHERE user_id` would (a) disclose another
  // tenant's task content into the attacker's AI response and (b) silently burn the
  // attacker's cloud-AI quota against the owner's data. The handler scopes the load
  // with `AND user_id` and returns 404 *before* any provider/LLM call, so the 404
  // path is fully integration-testable with no AI provider configured.
  test("ai/breakdown: attacker cannot break down another tenant's task → 404; no task content disclosed (IDOR guard)", async () => {
    const { body: task } = await api("POST", "/v1/tasks", {
      token: owner.token,
      body: { title: { en: "Owner confidential project" }, quadrant: "Q1" },
    });

    // Attacker references the owner's task by id. The scoped load misses → 404
    // NOT_FOUND, returned before getProviderConfig()/the LLM is ever consulted.
    const res = await api("POST", "/v1/ai/breakdown", {
      token: attacker.token,
      body: { taskId: task.id },
    });
    assert.equal(res.status, 404, "cross-tenant breakdown must 404 (no IDOR, no content disclosure)");
    // The error envelope must not leak the owner's task title/description.
    assert.ok(
      !JSON.stringify(res.body).includes("confidential"),
      "404 body must not echo the owner's task content",
    );

    // Owner's task is untouched and still breaks-down-eligible for the owner.
    const { status: ownerStatus } = await api("GET", `/v1/tasks/${task.id}`, { token: owner.token });
    assert.equal(ownerStatus, 200, "owner's task survives a cross-tenant breakdown attempt");
  });

  // Recoverability companion: a syntactically valid but non-existent taskId must
  // also 404 (not 5xx) without a provider — proving the not-found path is reached
  // before any LLM dependency.
  test("ai/breakdown: a non-existent taskId → 404 NOT_FOUND, never a 5xx", async () => {
    const res = await api("POST", "/v1/ai/breakdown", {
      token: owner.token,
      body: { taskId: "task_does_not_exist_xyz" },
    });
    assert.equal(res.status, 404, "missing task → 404, not a server crash");
    assert.equal((res.body as any)?.error?.code, "NOT_FOUND", "consistent machine-readable error code");
  });

  test("tasks/uncomplete: attacker cannot un-complete another tenant's task → 404; owner's task stays completed and its entry survives (#194)", async () => {
    // Owner creates + completes a task, producing a completed entry.
    const { body: task } = await api("POST", "/v1/tasks", {
      token: owner.token,
      body: { title: { en: "Owner done task" }, quadrant: "Q2" },
    });
    const comp = await api("POST", `/v1/tasks/${task.id}/complete`, { token: owner.token });
    assert.ok(comp.status >= 200 && comp.status < 300, "owner can complete own task");

    // Attacker tries to un-complete the owner's task by its id.
    const res = await api("POST", `/v1/tasks/${task.id}/uncomplete`, { token: attacker.token });
    assert.equal(res.status, 404, "cross-tenant uncomplete must 404 (no IDOR)");

    // Owner's task must remain completed and its completed entry must survive.
    const { body: ownerTask } = await api("GET", `/v1/tasks/${task.id}`, { token: owner.token });
    assert.equal(ownerTask.completed, true, "owner's task must stay completed after a cross-tenant uncomplete");
    const { body: ownerCompleted } = await api("GET", "/v1/completed", { token: owner.token });
    assert.ok(
      ((ownerCompleted as any).items as any[]).some((e) => e.task_id === task.id),
      "owner's completed entry must survive a cross-tenant uncomplete",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY — cross-tenant log-import guard on POST /v1/habits/migrate (#276)
//
// The #158/#165/#194 sweeps cover CRUD-by-id and state-changing sub-resources, but the
// bulk-import endpoint `POST /v1/habits/migrate` has NO presence in the daily regression
// at all — it is exercised only by the per-PR in-process api/habits.test.ts (in-memory).
// migrate writes into the SHARED `habit_logs` keyspace using a CLIENT-SUPPLIED `habitId`
// per log row. Without its ownership guard —
//     if (!ownedIds.has(l.habitId)) continue;   (routes/habits.ts)
// — a caller could smuggle log rows keyed to a habit id they do not own into their own
// scope (under their JWT user_id), polluting the shared key space with references to
// another tenant's habit. The guard drops any log whose habitId is not in the caller's
// owned set. A dropped/weakened guard would silently raise migrated.logs and leak the
// foreign habit id into the attacker's log list. This locks the guard over real HTTP +
// real file SQLite in the daily suite (PR CI green ≠ daily DFX coverage).
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Security — cross-tenant log-import guard on /v1/habits/migrate (#276)", () => {
  let victim: { token: string; id: string };
  let attacker: { token: string; id: string };

  before(async () => {
    victim = await registerUser("migrate-victim");
    attacker = await registerUser("migrate-attacker");
  });

  test("migrate drops a log referencing another tenant's habit; imports only owned logs", async () => {
    // Victim owns a real habit; its id is what the attacker will try to smuggle.
    const { status: vStatus, body: victimHabit } = await api("POST", "/v1/habits", {
      token: victim.token,
      body: { title: "Victim Habit", color: "green", frequency: "daily" },
    });
    assert.equal(vStatus, 201, "victim habit should create");
    const foreignId: string = victimHabit.id;

    // Attacker bulk-imports one OWNED habit plus two logs: one for their own habit
    // (must import) and one keyed to the VICTIM's habit id (must be dropped).
    const ownId = "habit_attacker_owned_273";
    const res = await api("POST", "/v1/habits/migrate", {
      token: attacker.token,
      body: {
        habits: [
          {
            id: ownId,
            title: "Attacker Owned",
            color: "cyan",
            frequency: "daily",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        logs: [
          { habitId: ownId, date: "2026-01-02", completedAt: "2026-01-02T08:00:00.000Z" },
          // Foreign: references the victim's habit id → the guard must skip it.
          { habitId: foreignId, date: "2026-01-03", completedAt: "2026-01-03T08:00:00.000Z" },
        ],
      },
    });

    assert.equal(res.status, 200, "migrate should succeed");
    // Load-bearing teeth: only the owned log counts. Dropping the guard → 2.
    assert.equal(res.body.migrated?.logs, 1, "only the owned log may be imported (foreign log dropped)");

    // The attacker's own log space must contain THEIR habit's log (positive control:
    // the negative assertion below is not vacuously green) …
    const { status: aStatus, body: attackerLogs } = await api("GET", "/v1/habits/logs", {
      token: attacker.token,
    });
    assert.equal(aStatus, 200);
    assert.ok(Array.isArray(attackerLogs), "logs response must be an array");
    assert.ok(
      attackerLogs.some((l: any) => l.habitId === ownId),
      "attacker's own migrated log must be imported",
    );
    // … and must NEVER contain a row keyed to the victim's habit id.
    assert.ok(
      !attackerLogs.some((l: any) => l.habitId === foreignId),
      "a log referencing another tenant's habit must not enter the attacker's log space (drop of the ownership guard would leak it)",
    );

    // The victim never checked in → their log space stays empty for that habit
    // (the smuggled row is written under the attacker's user_id, not the victim's,
    // so this is defense-in-depth, not the load-bearing assertion).
    const { body: victimLogs } = await api("GET", "/v1/habits/logs", { token: victim.token });
    assert.ok(
      !victimLogs.some((l: any) => l.habitId === foreignId),
      "victim's own log space must remain empty for the un-checked-in habit",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY — cross-tenant id-collision guard on the bulk-import migrate
// endpoints POST /v1/countdowns/migrate + POST /v1/projects/migrate (#295)
//
// Sibling gap to the #276 habits/migrate audit. `countdowns/migrate` and
// `projects/migrate` are bulk imports that INSERT rows with a CLIENT-SUPPLIED `id`
// while forcing `user_id` from the JWT. The tables key each row on a GLOBAL
// `id TEXT PRIMARY KEY` (not composite with user_id), so the ONLY thing stopping a
// caller from clobbering another tenant's row by supplying its id is the statement's
// conflict resolution: `INSERT OR IGNORE`. A colliding foreign id is silently skipped
// (no-op), so the attacker neither acquires nor overwrites the victim's row.
//
// The insidious part: both handlers return `migrated: <submitted>.length` — the
// SUBMITTED count, NOT the inserted count — so the response is 200 with the full
// count whether or not the row actually landed. The status code and the count are
// therefore BLIND to a regression that swaps `INSERT OR IGNORE` → `INSERT OR REPLACE`
// (an easy "make migrate overwrite on re-import" refactor). That mutation would let an
// attacker STEAL a victim's countdown/project by id: OR REPLACE rewrites the row's
// user_id to the attacker's, so the victim LOSES the row from their list and the
// attacker GAINS it. Only a state-survival assertion on both tenants' lists catches it.
// There is no GET /:id on either resource, so we read back via the owner's list.
// These endpoints have NO presence in the daily regression at all — closing that gap.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Security — cross-tenant id-collision guard on /v1/countdowns/migrate + /v1/projects/migrate (#295)", () => {
  let victim: { token: string; id: string };
  let attacker: { token: string; id: string };

  before(async () => {
    victim = await registerUser("migrate-collide-victim");
    attacker = await registerUser("migrate-collide-attacker");
  });

  test("countdowns/migrate cannot overwrite or steal another tenant's row by colliding id", async () => {
    // Victim owns a real countdown; its id is what the attacker will try to collide.
    const { status: vStatus, body: victimCd } = await api("POST", "/v1/countdowns", {
      token: victim.token,
      body: { title: "Victim Countdown", date: "2026-12-31", color: "green", repeat: "none" },
    });
    assert.equal(vStatus, 201, "victim countdown should create");
    const foreignId: string = victimCd.id;

    // Attacker bulk-imports one OWNED countdown plus one keyed to the VICTIM's id
    // (with different content) — the collision must be ignored, not applied.
    const ownId = "cd_attacker_owned_296";
    const res = await api("POST", "/v1/countdowns/migrate", {
      token: attacker.token,
      body: {
        events: [
          {
            id: ownId,
            title: "Attacker Owned",
            date: "2026-06-01",
            color: "cyan",
            repeat: "none",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: foreignId, // collides with the victim's row
            title: "STOLEN",
            date: "2026-01-01",
            color: "red",
            repeat: "none",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    // The endpoint returns the SUBMITTED count regardless — deliberately NOT a teeth
    // assertion (it stays 2 under both OR IGNORE and OR REPLACE); the teeth are below.
    assert.equal(res.status, 200, "migrate should succeed");

    // Attacker's list: must contain their OWN import (positive control — the negative
    // assertion below is not vacuously green) and must NEVER acquire the victim's id.
    const { status: aStatus, body: attackerList } = await api("GET", "/v1/countdowns", {
      token: attacker.token,
    });
    assert.equal(aStatus, 200);
    assert.ok(Array.isArray(attackerList), "countdowns list must be an array");
    assert.ok(
      attackerList.some((e: any) => e.id === ownId),
      "attacker's own migrated countdown must be imported",
    );
    // Load-bearing teeth #1: OR REPLACE would rewrite the row's user_id → attacker gains it.
    assert.ok(
      !attackerList.some((e: any) => e.id === foreignId),
      "attacker must NOT acquire the victim's countdown by colliding id (OR REPLACE would leak it)",
    );

    // Victim's list: the row must survive UNMUTATED (same title, not the attacker's "STOLEN").
    const { body: victimList } = await api("GET", "/v1/countdowns", { token: victim.token });
    const survivor = victimList.find((e: any) => e.id === foreignId);
    // Load-bearing teeth #2: OR REPLACE moves the row to the attacker → it vanishes here.
    assert.ok(survivor, "victim's countdown must survive the colliding import");
    assert.equal(survivor.title, "Victim Countdown", "victim's countdown content must be unmutated");
  });

  test("projects/migrate cannot overwrite or steal another tenant's row by colliding id", async () => {
    const { status: vStatus, body: victimPrj } = await api("POST", "/v1/projects", {
      token: victim.token,
      body: { name: "Victim Project", color: "green" },
    });
    assert.equal(vStatus, 201, "victim project should create");
    const foreignId: string = victimPrj.id;

    const ownId = "prj_attacker_owned_296";
    const res = await api("POST", "/v1/projects/migrate", {
      token: attacker.token,
      body: {
        projects: [
          {
            id: ownId,
            name: "Attacker Owned",
            color: "cyan",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: foreignId, // collides with the victim's row
            name: "STOLEN",
            color: "red",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    assert.equal(res.status, 200, "migrate should succeed");

    const { status: aStatus, body: attackerList } = await api("GET", "/v1/projects", {
      token: attacker.token,
    });
    assert.equal(aStatus, 200);
    assert.ok(Array.isArray(attackerList), "projects list must be an array");
    assert.ok(
      attackerList.some((p: any) => p.id === ownId),
      "attacker's own migrated project must be imported",
    );
    assert.ok(
      !attackerList.some((p: any) => p.id === foreignId),
      "attacker must NOT acquire the victim's project by colliding id (OR REPLACE would leak it)",
    );

    const { body: victimList } = await api("GET", "/v1/projects", { token: victim.token });
    const survivor = victimList.find((p: any) => p.id === foreignId);
    assert.ok(survivor, "victim's project must survive the colliding import");
    assert.equal(survivor.name, "Victim Project", "victim's project content must be unmutated");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY — cross-tenant foreign-key reference on the task write boundary (#220)
//
// The #158/#165/#194 sweeps cover CRUD-by-id and state-changing sub-resources. They
// do NOT cover the cross-RESOURCE foreign-key reference introduced by `task.project_id`
// (#213): a task may only reference a project the caller owns. The handler guards this
// with projectIsOwned() and rejects a cross-tenant reference with 400 INVALID_PROJECT
// (note: 400, not the 404 the other IDOR cases use — it's a body-field validation, not a
// path-id lookup). A dropped/weakened `WHERE user_id` in that guard would let a tenant
// file tasks into another tenant's project (cross-tenant linkage + project-id leakage).
// Unit-tested in api/tasks.test.ts (in-memory) but never exercised over real HTTP +
// real file SQLite in the daily regression — closing that gap here.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Security — cross-tenant project reference on task write boundary (#220)", () => {
  let owner: { token: string; id: string };
  let attacker: { token: string; id: string };
  before(async () => {
    owner = await registerUser("prj-ref-owner");
    attacker = await registerUser("prj-ref-attacker");
  });

  test("POST /tasks referencing another tenant's project → 400 INVALID_PROJECT; task not created", async () => {
    // Owner creates a project only they own.
    const { status: prjStatus, body: prj } = await api("POST", "/v1/projects", {
      token: owner.token,
      body: { name: "Owner Project", color: "cyan" },
    });
    assert.equal(prjStatus, 201, "owner can create own project");

    // Attacker tries to file a new task into the owner's project.
    const res = await api("POST", "/v1/tasks", {
      token: attacker.token,
      body: { title: { en: "Steal into their project" }, project_id: prj.id },
    });
    assert.equal(res.status, 400, "cross-tenant project reference must be rejected at the write boundary");
    assert.equal(res.body.error?.code, "INVALID_PROJECT", "should use the INVALID_PROJECT envelope");

    // The task must NOT have been created under the attacker.
    const { body: attackerTasks } = await api("GET", "/v1/tasks", { token: attacker.token });
    const items = Array.isArray(attackerTasks) ? attackerTasks : (attackerTasks as any).items;
    assert.ok(
      !(items as any[]).some((t) => t.project_id === prj.id),
      "no task linked to the foreign project may exist after the rejected create",
    );
  });

  test("PATCH /tasks/:id moving an own task into another tenant's project → 400; project_id unchanged", async () => {
    // Owner's project (the cross-tenant target).
    const { body: prj } = await api("POST", "/v1/projects", {
      token: owner.token,
      body: { name: "Owner Project 2", color: "amber" },
    });

    // Attacker creates an unfiled task of their own.
    const { status: createStatus, body: task } = await api("POST", "/v1/tasks", {
      token: attacker.token,
      body: { title: { en: "My own task" } },
    });
    assert.equal(createStatus, 201);
    assert.equal(task.project_id ?? null, null, "task starts unfiled");

    const res = await api("PATCH", `/v1/tasks/${task.id}`, {
      token: attacker.token,
      body: { project_id: prj.id },
    });
    assert.equal(res.status, 400, "cross-tenant PATCH move must be rejected");
    assert.equal(res.body.error?.code, "INVALID_PROJECT");

    // The task's project_id must be unchanged (still null).
    const { body: after } = await api("GET", `/v1/tasks/${task.id}`, { token: attacker.token });
    assert.equal(after.project_id ?? null, null, "a rejected cross-tenant move must not mutate project_id");
  });

  test("teeth/sanity: a task referencing the caller's OWN project still succeeds (201, round-trips)", async () => {
    const { body: prj } = await api("POST", "/v1/projects", {
      token: owner.token,
      body: { name: "Owner Project 3", color: "green" },
    });
    const res = await api("POST", "/v1/tasks", {
      token: owner.token,
      body: { title: { en: "Filed correctly" }, project_id: prj.id },
    });
    assert.equal(res.status, 201, "filing a task into the caller's own project must succeed");
    assert.equal(res.body.project_id, prj.id, "own-project link must round-trip");
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

  test("templates: nested-payload validation rejects an out-of-range field → 400, not 5xx", async () => {
    // `payload.duration` is bounded (0..1440). A nested-schema violation must be
    // a client error, proving validation reaches into the JSON payload column and
    // does not slip a bad blueprint past the contract into storage.
    const { status } = await api("POST", "/v1/templates", {
      token: alice.token,
      body: { name: "Bad blueprint", payload: { title: { en: "x" }, duration: 99999 } },
    });
    assert.equal(status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for ROBUSTNESS / SCALABILITY — bounded nested payload on /v1/projects
//
// Coverage-gap audit (#213/#219 projects): the parametrized #158 cases reach
// /v1/projects only for tenant-isolation + malformed-JSON. The richest, most
// growth-prone payload in the app — a project's nested `goals[]` array and its
// rich-text `content` document — has NO integration coverage for its declared
// BOUNDS. Those bounds are the only thing standing between a client and an
// unbounded row, because there is no body-size middleware: `content` is capped
// at 1 MB and `goals` at 50 elements (each `text` ≤ 200) purely by the Zod
// contract. A regression that loosened/dropped any of those caps (or a 5xx on an
// oversized body instead of a clean 400) would slip past every existing case.
// This is sharpened by the in-flight TipTap inline-image work (#222), which
// inflates `content` with base64 image data toward that very cap.
//
// Each case asserts the canonical 400 `VALIDATION_ERROR` envelope AND that the
// offending dotted field path is named — so the test has teeth: it proves the
// RIGHT bound rejected the input (validation reached into the nested array
// element / the array length / the content column), not an incidental 400.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness/Scalability — bounded nested payload on /v1/projects (#213/#219)", () => {
  test("oversized `content` (> 1 MB cap) → 400 VALIDATION_ERROR, never a 5xx / unbounded write", async () => {
    // One byte past the deliberate 1 MB row-size cap. With no body-size
    // middleware, this whole body is buffered + JSON-parsed before the contract
    // rejects it — the cap must still degrade to a clean client error.
    const { status, body } = await api("POST", "/v1/projects", {
      token: alice.token,
      body: { name: "Huge doc", content: "a".repeat(1_000_001) },
    });
    assert.equal(status, 400, "an over-cap content body must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "content"),
      "the rejection must name `content` (the size cap fired, not an incidental 400)",
    );

    // Recoverability: the oversized body must not poison the server — a normal
    // create still succeeds afterwards, proving no crash / no unbounded write.
    const ok = await api("POST", "/v1/projects", {
      token: alice.token,
      body: { name: "Right-sized", content: "ok" },
    });
    assert.equal(ok.status, 201, "server stays healthy after rejecting an oversized body");
  });

  test("nested goal field (`goals[].text` > 200) → 400, validation reaches into the array element", async () => {
    const { status, body } = await api("POST", "/v1/projects", {
      token: alice.token,
      body: { name: "Bad goal text", goals: [{ text: "x".repeat(201) }] },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path.startsWith("goals.0")),
      "the rejection must name the offending nested goal element (e.g. `goals.0.text`)",
    );
  });

  test("over-cap `goals` array (> 50 elements) → 400, the array length bound holds", async () => {
    const goals = Array.from({ length: 51 }, (_, i) => ({ text: `goal ${i}` }));
    const { status, body } = await api("POST", "/v1/projects", {
      token: alice.token,
      body: { name: "Too many goals", goals },
    });
    assert.equal(status, 400, "an over-cap goals array must be rejected (no unbounded array write)");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "goals"),
      "the rejection must name `goals` (the array-length cap fired)",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for ROBUSTNESS/SCALABILITY — bounded project-kind template payload (#211 V2)
//
// Coverage-gap audit (#236, project templates PR1 #233): #233 turned
// TemplateCreateBodySchema into a `z.union` of a task variant and a NEW project
// variant (ProjectTemplatePayloadSchema). That project payload is a distinct
// JSON-column shape — the project's authored fields plus a bundle of task
// blueprints — with its own bounds: `content` ≤ 1 MB, `goals` ≤ 50 (each
// `goals[].text` ≤ 200), and **`tasks` ≤ 100** task blueprints (a bound UNIQUE
// to project templates — no direct-/projects analogue). With no body-size
// middleware, these Zod caps are the ONLY bound on template row growth. Before
// this block the DFX suite reached /v1/templates only via the #158
// tenant-isolation/malformed-JSON cases and the #184 TASK-kind `payload.duration`
// nested bound — the PROJECT-kind payload had zero robustness coverage. A
// regression loosening/dropping any cap, or a 5xx on an oversized project-template
// body instead of a clean 400, would slip past every existing case (sharpened by
// #222 inflating `content` + #235 instantiating project templates).
//
// Teeth: each case asserts the canonical 400 `VALIDATION_ERROR` envelope AND that
// the offending dotted `payload.*` path is named — proving the RIGHT bound fired
// inside the union's project variant (not an incidental 400 / the union rejecting
// wholesale), and AC1 pairs the rejection with a valid project-template create →
// 201 (recoverability + proof it was the cap, not the union structure).
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness/Scalability — bounded project-kind template payload (#211 V2)", () => {
  test("over-cap `payload.content` (> 1 MB) → 400 VALIDATION_ERROR naming payload.content, never a 5xx; server recovers", async () => {
    const { status, body } = await api("POST", "/v1/templates", {
      token: alice.token,
      body: { name: "Huge project blueprint", kind: "project", payload: { name: "Huge", content: "a".repeat(1_000_001) } },
    });
    assert.equal(status, 400, "an over-cap project-template content must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "payload.content"),
      "the rejection must name `payload.content` (the size cap fired inside the project variant, not an incidental 400)",
    );

    // Recoverability + teeth: a valid project template of the same shape still
    // creates → 201, proving it was the CAP that rejected above, not the union
    // structure, and that the oversized body did not poison the server.
    const ok = await api("POST", "/v1/templates", {
      token: alice.token,
      body: { name: "Right-sized project", kind: "project", payload: { name: "OK", content: "ok", goals: [{ text: "g" }], tasks: [{ title: { en: "t" } }] } },
    });
    assert.equal(ok.status, 201, "a valid project template must still create after the oversized body was rejected");
    assert.equal(ok.body.kind, "project", "the created template round-trips as kind=project");
  });

  test("over-length nested `payload.goals.0.text` (> 200) → 400, validation reaches into the array element", async () => {
    const { status, body } = await api("POST", "/v1/templates", {
      token: alice.token,
      body: { name: "Bad goal blueprint", kind: "project", payload: { name: "P", goals: [{ text: "x".repeat(201) }] } },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path.startsWith("payload.goals.0")),
      "the rejection must name the offending nested goal element (e.g. `payload.goals.0.text`)",
    );
  });

  test("over-cap `payload.tasks` blueprint array (> 100) → 400 naming payload.tasks (project-template-unique bound)", async () => {
    const tasks = Array.from({ length: 101 }, () => ({ title: { en: "scaffold" } }));
    const { status, body } = await api("POST", "/v1/templates", {
      token: alice.token,
      body: { name: "Too many scaffolds", kind: "project", payload: { name: "P", tasks } },
    });
    assert.equal(status, 400, "an over-cap task-blueprint array must be rejected (no unbounded array write)");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "payload.tasks"),
      "the rejection must name `payload.tasks` (the project-template-unique array-length cap fired)",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for ROBUSTNESS — `remind_at` reminder field is format-bounded (#176)
//
// Coverage-gap audit (per-task reminders, #176): `tasks.remind_at` is the field
// the reminder scheduler reads to decide WHEN to fire a notification. Its contract
// bound is a strict local-wall-clock datetime regex
// (`YYYY-MM-DDTHH:MM(:SS)?`) — the ONLY thing standing between a client and a
// junk value landing in the column the scheduler later parses. Before this block
// the entire reminder surface had zero integration/DFX coverage: a regression that
// loosened the regex to `z.string()` (or dropped it) would let `"tomorrow"` /
// a date-only string / a TZ-suffixed ISO into storage and slip past every existing
// case — surfacing only as a mis-fired or scheduler-crashing reminder in prod.
//
// The cases give the bound teeth on BOTH write paths (create + update) and prove
// the round-trip: a malformed value is a clean 400 (never a 5xx / silent write),
// a valid value persists and reflects back, and a bad PATCH leaves the stored
// value unmutated (no partial poison of the scheduler's input).
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness — `remind_at` reminder field is format-bounded (#176)", () => {
  test("malformed `remind_at` on create → 400 VALIDATION_ERROR naming the field, never a 5xx / write", async () => {
    const { status, body } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Bad reminder" }, quadrant: "Q1", remind_at: "tomorrow afternoon" },
    });
    assert.equal(status, 400, "a junk reminder value must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "remind_at"),
      "the rejection must name `remind_at` (the format bound fired, not an incidental 400)",
    );
  });

  test("date-only `remind_at` (no time component) → 400 — the full datetime bound has teeth", async () => {
    // `"2026-06-30"` is a valid `due` date but NOT a valid `remind_at`: the
    // scheduler needs a wall-clock time, so the regex demands `T HH:MM`. This
    // proves the bound rejects a plausible-but-incomplete value, not just garbage.
    const { status, body } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Date only" }, quadrant: "Q1", remind_at: "2026-06-30" },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "remind_at"),
      "a date with no time must still name `remind_at`",
    );
  });

  test("valid `remind_at` round-trips — create persists it and a read reflects it back", async () => {
    const remindAt = "2026-12-01T09:30";
    const { status, body: created } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Standup" }, quadrant: "Q1", remind_at: remindAt },
    });
    assert.equal(status, 201, "a well-formed reminder must be accepted");
    assert.equal(created.remind_at, remindAt, "the create response must echo the stored reminder");

    // The value must survive storage so the scheduler can read it back later.
    const read = await api("GET", `/v1/tasks/${created.id}`, { token: alice.token });
    assert.equal(read.status, 200);
    assert.equal(read.body.remind_at, remindAt, "a subsequent read must reflect the persisted reminder");
  });

  test("malformed `remind_at` on PATCH → 400 and the stored value is left unmutated", async () => {
    // Seed a task with a good reminder, then try to corrupt it via update.
    const good = "2026-12-02T08:00";
    const { body: created } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Patch target" }, quadrant: "Q1", remind_at: good },
    });

    const { status, body } = await api("PATCH", `/v1/tasks/${created.id}`, {
      token: alice.token,
      body: { remind_at: "not-a-datetime" },
    });
    assert.equal(status, 400, "the update path must validate `remind_at` too");
    assert.equal(body.error?.code, "VALIDATION_ERROR");

    // No partial poison: the rejected PATCH must not have overwritten the column.
    const read = await api("GET", `/v1/tasks/${created.id}`, { token: alice.token });
    assert.equal(read.status, 200);
    assert.equal(read.body.remind_at, good, "a rejected update must leave the stored reminder unchanged");
  });
});

// Design for ROBUSTNESS — countdown `date` anchor is format-bounded (#240)
//
// Coverage-gap audit: a countdown event's `date` is the solar (Gregorian) ISO
// anchor that BOTH the "days until" countdown math and the lunar-recurrence
// engine parse. Its only contract bound is a strict date-only regex
// (`^\d{4}-\d{2}-\d{2}$`, on `CountdownBody` + the partial `CountdownUpdateBody`)
// — the sole guard between a client and a junk value landing in the column that
// display + recurrence math later read. Like `remind_at` (#176), the countdown
// surface had no robustness DFX coverage: a regression that loosened the regex
// to `z.string()` (or dropped it) would let `"someday"` / a full-datetime string
// into storage and slip past every existing case — surfacing only as a NaN
// "days until" or a crashing lunar conversion in prod.
//
// Gives the bound teeth on BOTH write paths (create + update) and proves the
// round-trip: a malformed value is a clean 400 (never a 5xx / silent write), a
// valid value persists + reflects back (there is no GET /:id — read via the
// owner's list), and a bad PATCH leaves the stored date unmutated.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness — countdown `date` anchor is format-bounded (#240)", () => {
  async function createCountdown(token: string, date: string) {
    return api("POST", "/v1/countdowns", {
      token,
      body: { title: "Trip", date, emoji: "✈️", color: "green" },
    });
  }

  test("malformed `date` on create → 400 VALIDATION_ERROR naming the field, never a 5xx / write", async () => {
    const { status, body } = await createCountdown(alice.token, "someday");
    assert.equal(status, 400, "a junk date must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "date"),
      "the rejection must name `date` (the format bound fired, not an incidental 400)",
    );
  });

  test("full datetime `date` (plausible but wrong shape) → 400 — the date-only bound has teeth", async () => {
    // `"2026-07-01T09:30"` is a valid task `remind_at` but NOT a valid countdown
    // anchor: the countdown wants a date-only string, so the regex forbids the
    // time component. Proves the bound rejects a plausible-but-wrong value, not
    // just garbage.
    const { status, body } = await createCountdown(alice.token, "2026-07-01T09:30");
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "date"),
      "a datetime with a time component must still name `date`",
    );
  });

  test("valid `date` round-trips — create persists it and a list read reflects it back", async () => {
    const date = "2026-12-25";
    const { status, body: created } = await createCountdown(alice.token, date);
    assert.equal(status, 201, "a well-formed date must be accepted");
    assert.equal(created.date, date, "the create response must echo the stored date");

    // No GET /:id on this resource — the value must survive storage and appear
    // in the owner's list so display + recurrence can read it back later.
    const list = await api("GET", "/v1/countdowns", { token: alice.token });
    assert.equal(list.status, 200);
    const found = (list.body as Array<{ id: string; date: string }>).find((e) => e.id === created.id);
    assert.ok(found, "the created countdown must appear in the owner's list");
    assert.equal(found!.date, date, "a subsequent read must reflect the persisted date");
  });

  test("malformed `date` on PATCH → 400 and the stored date is left unmutated", async () => {
    const good = "2027-01-01";
    const { body: created } = await createCountdown(alice.token, good);

    const { status, body } = await api("PATCH", `/v1/countdowns/${created.id}`, {
      token: alice.token,
      body: { date: "2027/01/01" },
    });
    assert.equal(status, 400, "the update path must validate `date` too");
    assert.equal(body.error?.code, "VALIDATION_ERROR");

    // No partial poison: the rejected PATCH must not have overwritten the column.
    const list = await api("GET", "/v1/countdowns", { token: alice.token });
    const found = (list.body as Array<{ id: string; date: string }>).find((e) => e.id === created.id);
    assert.equal(found?.date, good, "a rejected update must leave the stored date unchanged");
  });
});

describe("DFX · Robustness — settings reminder-time fields are format-bounded (#264)", () => {
  // `morning_reminder_time` / `evening_reminder_time` are the `HH:MM` anchors
  // that PATCH /v1/settings stores verbatim and GET /v1/settings returns to drive
  // the client's morning/evening reminder scheduling. Their ONLY guard is a shape
  // regex `^\d{2}:\d{2}$` (nullable/optional). Sibling of the #176 `remind_at` /
  // #240 `countdowns.date` format bounds: settings is otherwise absent from this
  // daily suite, so a regression loosening the regex to `z.string()` would let a
  // malformed time into the column — surfacing only as a mis-parsed / never-firing
  // reminder in prod — past every existing case. (The registration flow seeds a
  // settings row, so a PATCH on the shared actor targets an existing singleton.)

  test("malformed `morning_reminder_time` (`9am`) → 400 VALIDATION_ERROR naming the field, never a 5xx / write", async () => {
    const { status, body } = await api("PATCH", "/v1/settings", {
      token: alice.token,
      body: { morning_reminder_time: "9am" },
    });
    assert.equal(status, 400, "a junk time must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "morning_reminder_time"),
      "the rejection must name `morning_reminder_time` (the format bound fired, not an incidental 400)",
    );
  });

  test("single-digit `evening_reminder_time` (`9:5`) → 400 — the `\\d{2}:\\d{2}` bound has teeth", async () => {
    // `"9:5"` is a plausible-but-wrong time: it *looks* like a clock value but
    // violates the two-digit-each shape, so the regex must reject it. Proves the
    // bound rejects a near-miss, not just obvious garbage.
    const { status, body } = await api("PATCH", "/v1/settings", {
      token: alice.token,
      body: { evening_reminder_time: "9:5" },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "evening_reminder_time"),
      "a single-digit time must still name `evening_reminder_time`",
    );
  });

  test("valid `HH:MM` values round-trip — PATCH persists them and GET reflects them back", async () => {
    const morning = "07:15";
    const evening = "21:45";
    const { status, body } = await api("PATCH", "/v1/settings", {
      token: alice.token,
      body: { morning_reminder_time: morning, evening_reminder_time: evening },
    });
    assert.equal(status, 200, "well-formed times must be accepted");
    assert.equal(body.morning_reminder_time, morning, "the PATCH response must echo the stored morning time");
    assert.equal(body.evening_reminder_time, evening, "the PATCH response must echo the stored evening time");

    // The values must survive storage so the client's scheduler can read them back.
    const get = await api("GET", "/v1/settings", { token: alice.token });
    assert.equal(get.status, 200);
    assert.equal(get.body.morning_reminder_time, morning, "a subsequent read must reflect the persisted morning time");
    assert.equal(get.body.evening_reminder_time, evening, "a subsequent read must reflect the persisted evening time");
  });

  test("malformed `morning_reminder_time` on PATCH → 400 and the stored value is left unmutated", async () => {
    // Anchor a known-good value first, then attempt a poisoning update.
    const good = "06:30";
    await api("PATCH", "/v1/settings", { token: alice.token, body: { morning_reminder_time: good } });

    const { status, body } = await api("PATCH", "/v1/settings", {
      token: alice.token,
      body: { morning_reminder_time: "25:99:99" },
    });
    assert.equal(status, 400, "a malformed update must be rejected");
    assert.equal(body.error?.code, "VALIDATION_ERROR");

    // No partial poison: the rejected PATCH must not have overwritten the column.
    const get = await api("GET", "/v1/settings", { token: alice.token });
    assert.equal(get.body.morning_reminder_time, good, "a rejected update must leave the stored time unchanged");
  });
});

describe("DFX · Robustness — habit check-in `date` is format-bounded (#267)", () => {
  // Last member of the scheduler/streak-driving format-bound family
  // (#176 remind_at → #240 countdowns.date → #264 settings reminder-times).
  // The check-in `date` is the key of every `habit_logs` row and the sole input
  // to the client's streak computation; it is gated ONLY by `^\d{4}-\d{2}-\d{2}$`
  // on two surfaces — the `POST /:id/log` JSON body AND the `DELETE /:id/log/:date`
  // path param. The DELETE is the insidious one: it is idempotent (204 on no
  // match), so a dropped param bound would slip a bad date into an unguarded
  // `DELETE … WHERE date = :date` with no status-code change.
  let habitId = "";

  before(async () => {
    // `alice` is created by the first Security describe's before-hook; reuse it.
    const created = await api("POST", "/v1/habits", {
      token: alice.token,
      body: { title: "Read", color: "green", frequency: "daily" },
    });
    assert.equal(created.status, 201, "habit setup must succeed");
    habitId = created.body.id;
  });

  test("malformed `date` on POST /:id/log → 400 VALIDATION_ERROR naming `date`, no check-in written", async () => {
    const { status, body } = await api("POST", `/v1/habits/${habitId}/log`, {
      token: alice.token,
      body: { date: "someday" },
    });
    assert.equal(status, 400, "a junk check-in date must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "date"),
      "the rejection must name `date` (the format bound fired, not an incidental 400)",
    );

    // Nothing was written for the rejected date.
    const logs = await api("GET", "/v1/habits/logs", { token: alice.token });
    assert.ok(
      !(logs.body as Array<{ date: string }>).some((l) => l.date === "someday"),
      "a rejected check-in must not have persisted a log row",
    );
  });

  test("full-datetime `date` on POST /:id/log (plausible but wrong shape) → 400 — the date-only bound has teeth", async () => {
    // `"2026-07-02T09:30"` is a valid task `remind_at` but NOT a valid check-in
    // date: the streak math wants a date-only key, so the regex forbids the time
    // component. Proves the bound rejects a plausible-but-wrong value, not just
    // garbage.
    const { status, body } = await api("POST", `/v1/habits/${habitId}/log`, {
      token: alice.token,
      body: { date: "2026-07-02T09:30" },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "date"),
      "a datetime with a time component must still name `date`",
    );
  });

  test("valid `date` round-trips — POST /:id/log persists it and GET /habits/logs reflects it", async () => {
    const date = "2026-12-25";
    const { status, body: log } = await api("POST", `/v1/habits/${habitId}/log`, {
      token: alice.token,
      body: { date },
    });
    assert.equal(status, 201, "a well-formed date must be accepted");
    assert.equal(log.date, date, "the create response must echo the stored date");

    // The streak input must survive storage and be readable back.
    const logs = await api("GET", "/v1/habits/logs", { token: alice.token });
    assert.equal(logs.status, 200);
    const found = (logs.body as Array<{ habitId: string; date: string }>).find(
      (l) => l.habitId === habitId && l.date === date,
    );
    assert.ok(found, "a subsequent read must reflect the persisted check-in");
  });

  test("malformed `date` on DELETE /:id/log/:date (path param) → 400, and an existing check-in survives", async () => {
    // A real check-in the idempotent DELETE must NOT be able to clear via a bad
    // path param.
    const keep = "2028-03-03";
    const seed = await api("POST", `/v1/habits/${habitId}/log`, {
      token: alice.token,
      body: { date: keep },
    });
    assert.equal(seed.status, 201);

    const { status, body } = await api("DELETE", `/v1/habits/${habitId}/log/someday`, {
      token: alice.token,
    });
    assert.equal(status, 400, "the DELETE path param must validate `date` too (before the idempotent 204)");
    assert.equal(body.error?.code, "VALIDATION_ERROR");

    // No poison: the rejected malformed DELETE must not have touched real rows.
    const logs = await api("GET", "/v1/habits/logs", { token: alice.token });
    assert.ok(
      (logs.body as Array<{ habitId: string; date: string }>).some(
        (l) => l.habitId === habitId && l.date === keep,
      ),
      "a rejected malformed DELETE must leave existing check-ins intact",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for ROBUSTNESS — `people` avatar fields are format/length-bounded (#279)
//
// Coverage-gap audit: the `people` resource is present in this daily suite only
// via the #158 tenant-isolation + malformed-JSON cases — it has NO format/bound
// robustness coverage on its own fields, despite carrying three strictly-bounded,
// display-driving inputs whose ONLY guard is a Zod format/length rule at the
// route boundary (`validate("json", PersonCreateBodySchema)`, and its partial on
// PATCH):
//
//   • `color`    — `^#[0-9a-fA-F]{6}$`, rendered DIRECTLY as the avatar's CSS
//                  background color on the client. Loosening it to `z.string()`
//                  would let an arbitrary string into a value the UI injects into
//                  `style` — a robustness + mild CSS-injection concern that would
//                  surface only in the rendered DOM, past every existing case.
//   • `initials` — `min(1).max(2)`; a UI-integrity bound (the avatar bubble is
//                  sized for ≤ 2 chars; an over-length value overflows the layout).
//   • `email`    — `z.string().email().max(255)`; a format bound.
//
// Same class as the scheduler/format-bound family (#176 remind_at → #240
// countdowns.date → #264 settings times → #267 habit date), applied to the last
// user-scoped CRUD resource whose format bounds are untested at the daily
// real-HTTP + real-SQLite layer. PATCH re-validates the full partial body, so the
// bounds apply on BOTH write paths; there is no GET /:id, so round-trips read back
// via the owner's list (like countdowns). Gives each bound teeth (a plausible-but-
// wrong value, not just garbage, is rejected), proves the valid round-trip, and
// proves a rejected PATCH leaves the stored row unmutated (no partial poison).
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness — `people` avatar fields are format/length-bounded (#279)", () => {
  function createPerson(token: string, overrides: Record<string, unknown> = {}) {
    return api("POST", "/v1/people", {
      token,
      body: { name: "Sam", initials: "SM", color: "#3366cc", email: null, ...overrides },
    });
  }

  function namesField(body: any, field: string): boolean {
    return (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === field) ?? false;
  }

  test("malformed `color` (non-hex) on create → 400 VALIDATION_ERROR naming `color`, never a 5xx / write", async () => {
    const { status, body } = await createPerson(alice.token, { color: "royalblue" });
    assert.equal(status, 400, "a non-hex color must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(namesField(body, "color"), "the rejection must name `color` (the format bound fired, not an incidental 400)");
  });

  test("plausible-but-wrong `color` (3-digit `#fff`) → 400 — the strict 6-hex bound has teeth", async () => {
    // `#fff` is valid CSS shorthand but NOT the contract's 6-hex shape. Proves the
    // bound rejects a plausible-but-wrong value, not just obvious garbage.
    const { status, body } = await createPerson(alice.token, { color: "#fff" });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(namesField(body, "color"), "a 3-digit hex must still name `color`");
  });

  test("over-length `initials` (> 2 chars) → 400 naming `initials`", async () => {
    const { status, body } = await createPerson(alice.token, { initials: "SAM" });
    assert.equal(status, 400, "initials longer than the 2-char avatar bubble must be rejected");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(namesField(body, "initials"), "the rejection must name `initials`");
  });

  test("malformed `email` → 400 naming `email`", async () => {
    const { status, body } = await createPerson(alice.token, { email: "not-an-email" });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(namesField(body, "email"), "the rejection must name `email`");
  });

  test("a fully valid person round-trips — create persists it and a list read reflects it back", async () => {
    const color = "#a1b2c3";
    const { status, body: created } = await createPerson(alice.token, { name: "Dana", initials: "DA", color });
    assert.equal(status, 201, "a well-formed person must be accepted");
    assert.equal(created.color, color, "the create response must echo the stored color");

    // No GET /:id on this resource — the value must survive storage and appear in
    // the owner's list so the avatar can read it back later.
    const list = await api("GET", "/v1/people", { token: alice.token });
    assert.equal(list.status, 200);
    const found = (list.body as Array<{ id: string; color: string; initials: string }>).find((p) => p.id === created.id);
    assert.ok(found, "the created person must appear in the owner's list");
    assert.equal(found!.color, color, "a subsequent read must reflect the persisted color");
    assert.equal(found!.initials, "DA", "a subsequent read must reflect the persisted initials");
  });

  test("malformed `color` on PATCH → 400 and the stored row is left unmutated", async () => {
    const good = "#0f0f0f";
    const { body: created } = await createPerson(alice.token, { name: "Rio", initials: "RO", color: good });

    const { status, body } = await api("PATCH", `/v1/people/${created.id}`, {
      token: alice.token,
      body: { color: "blue" },
    });
    assert.equal(status, 400, "the update path must validate `color` too");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(namesField(body, "color"), "the rejected PATCH must name `color`");

    // No partial poison: the rejected PATCH must not have overwritten the column.
    const list = await api("GET", "/v1/people", { token: alice.token });
    const found = (list.body as Array<{ id: string; color: string }>).find((p) => p.id === created.id);
    assert.equal(found?.color, good, "a rejected update must leave the stored color unchanged");
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

// ───────────────────────────────────────────────────────────────────────────────
// Scalability gap (#202): the cases above only exercise /v1/tasks. The full-history
// completed log — GET /v1/completed with no ?date (#164) — is the list most prone
// to unbounded growth (every completion an account ever made), and its pagination
// contract DIFFERS from tasks: DEFAULT_LIMIT 200 / MAX_LIMIT 500, and an over-max
// `limit` is **clamped** (Math.min) rather than rejected with 400. A regression that
// "harmonized" it with tasks (rejecting over-max → 400) or dropped the clamp (→
// unbounded read) would slip past the tasks-only cases. These lock the completed
// contract in over real HTTP + real SQLite.
// ───────────────────────────────────────────────────────────────────────────────

describe("DFX · Scalability — completed full-history pagination is bounded & walk-complete (#202)", () => {
  let histUser: { token: string; id: string };
  const TOTAL = 12; // > the page sizes used below so paging is genuinely exercised

  before(async () => {
    histUser = await registerUser("completed-scaler");
    // Each completion appends exactly one row to the full-history completed log.
    for (let i = 0; i < TOTAL; i++) {
      const { body: task } = await api("POST", "/v1/tasks", {
        token: histUser.token,
        body: { title: { en: `done ${String(i).padStart(3, "0")}` }, quadrant: "Q1" },
      });
      const { status } = await api("POST", `/v1/tasks/${task.id}/complete`, { token: histUser.token });
      assert.ok(status >= 200 && status < 300, `seed completion ${i} should succeed`);
    }
  });

  test("an explicit limit bounds the page and yields a nextCursor when more history remains", async () => {
    const { status, body } = await api("GET", "/v1/completed?limit=5", { token: histUser.token });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items), "full-history response must be an { items, nextCursor } envelope");
    assert.equal(body.items.length, 5, "page must be bounded to the requested limit");
    assert.ok(body.nextCursor, "more than one page of history → nextCursor must be present");
  });

  test("an over-max limit is CLAMPED (≤ 500), not rejected with 400 — completed differs from tasks", async () => {
    const { status, body } = await api("GET", "/v1/completed?limit=99999", { token: histUser.token });
    assert.equal(status, 200, "completed clamps an over-max limit; it must not 400 like /v1/tasks");
    assert.ok(Array.isArray(body.items), "response must still be the { items, nextCursor } envelope");
    assert.ok(body.items.length <= 500, `page must stay bounded by MAX_LIMIT (500), got ${body.items.length}`);
    // With only TOTAL (< 500) rows the clamped single page holds them all.
    assert.equal(body.items.length, TOTAL, "all history fits in one clamped page here");
    assert.equal(body.nextCursor, null, "no further page when everything fits in one clamped page");
  });

  test("cursor paging walks every completed entry exactly once — no dupes, no omissions", async () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = cursor
        ? `/v1/completed?limit=4&cursor=${encodeURIComponent(cursor)}`
        : "/v1/completed?limit=4";
      const { status, body } = await api("GET", url, { token: histUser.token });
      assert.equal(status, 200);
      for (const item of body.items) {
        assert.ok(!seen.has(item.id), `entry ${item.id} returned on more than one page`);
        seen.add(item.id);
      }
      cursor = body.nextCursor;
      pages++;
      assert.ok(pages <= 10, "pagination did not terminate — possible cursor loop");
    } while (cursor);
    assert.equal(seen.size, TOTAL, `expected ${TOTAL} unique completed entries across pages, got ${seen.size}`);
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

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY — LLM-output-driven cross-tenant write (IDOR) on /ai/classify
// ═══════════════════════════════════════════════════════════════════════════════
//
// `POST /v1/ai/classify` fetches the caller's unclassified tasks, injects their
// (attacker-controllable) titles into an LLM prompt, then writes the model's
// returned per-task quadrant back with
//   `UPDATE tasks SET ai_suggest = ... WHERE id = <model-supplied id>`.
// Because the write target comes from *model output* — and a task title fed into
// the prompt is attacker-controlled — a prompt-injection could coax the model into
// naming *another tenant's* task id. If that UPDATE were not scoped by `user_id`,
// classify would mutate the victim's row: a silent cross-tenant write (classify
// still returns 200, so only a "victim's row unchanged" assertion catches it —
// the same insidious class as the #190 focus/sessions footgun, where the endpoint
// never 404s). `/ai/recommend` already validates the model's id against the
// caller's own task set; `/ai/classify` relies on the scoped write instead.
//
// This is the one DFX case that exercises the LLM happy-path (the rest of the
// suite runs with no provider): the attacker's `custom` provider is pointed at a
// local mock LLM server that returns a crafted classify response naming the
// victim's task id. dbMode() is "local" in the test env, so the settings SSRF
// guard permits the 127.0.0.1 base URL (desktop/self-hosted-LLM allowance).
describe("DFX · Security — /ai/classify cannot write another tenant's task via an LLM-supplied id (IDOR)", () => {
  let victim: { token: string; id: string };
  let attacker: { token: string; id: string };
  let llmServer: Server;
  // The task id the mock LLM names in its classify response; set per test just
  // before the classify call.
  let poisonTaskId = "";

  before(async () => {
    victim = await registerUser("classify-victim");
    attacker = await registerUser("classify-attacker");

    // Minimal OpenAI-compatible chat/completions mock: ignores the request body
    // and returns a classify array naming `poisonTaskId` — i.e. a model that has
    // been prompt-injected into targeting the victim's task.
    llmServer = createServer((req, res) => {
      req.on("data", () => {});
      req.on("end", () => {
        const content = JSON.stringify([
          { task_id: poisonTaskId, quadrant: "Q4", confidence: 0.99, reason: "injected" },
        ]);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }] }));
      });
    });
    await new Promise<void>((resolve) => llmServer.listen(0, "127.0.0.1", () => resolve()));
    const llmPort = (llmServer.address() as AddressInfo).port;

    // Point the attacker's `custom` provider at the mock server. The settings PATCH
    // encrypts the key server-side; getProviderConfig() will then use this key +
    // baseUrl for the attacker's classify call (usingCloud=false, no quota touched).
    const cfg = await api("PATCH", "/v1/settings", {
      token: attacker.token,
      body: {
        ai_provider: "custom",
        ai_configs_update: {
          provider: "custom",
          key: "sk-test-mock-key",
          baseUrl: `http://127.0.0.1:${llmPort}`,
        },
      },
    });
    assert.equal(cfg.status, 200, "attacker provider config should be accepted");
  });

  after(() => {
    try { llmServer?.close(); } catch { /* best-effort */ }
  });

  test("victim's ai_suggest is NOT mutated when the attacker's LLM names the victim's task during classify", async () => {
    // Victim owns an unclassified task with no ai_suggest yet.
    const { body: victimTask } = await api("POST", "/v1/tasks", {
      token: victim.token,
      body: { title: { en: "Victim private task" }, quadrant: "unclassified" },
    });
    assert.equal(victimTask.ai_suggest ?? null, null, "victim task starts with no ai_suggest");

    // Attacker needs ≥1 unclassified task so classify reaches the LLM (it returns
    // early with an empty result when the caller has nothing to classify).
    await api("POST", "/v1/tasks", {
      token: attacker.token,
      body: { title: { en: "Attacker task" }, quadrant: "unclassified" },
    });

    // The mock LLM will name the victim's task id in its response.
    poisonTaskId = victimTask.id;

    const res = await api("POST", "/v1/ai/classify", { token: attacker.token, body: {} });
    assert.equal(res.status, 200, "classify itself still succeeds — the cross-tenant write is silently scoped out");

    // Load-bearing assertion: the victim's row is untouched. If the classify
    // UPDATE dropped `AND user_id`, ai_suggest would now read "Q4".
    const { body: after } = await api("GET", `/v1/tasks/${victimTask.id}`, { token: victim.token });
    assert.equal(
      after.ai_suggest ?? null,
      null,
      "attacker's classify must NOT write the victim's ai_suggest (cross-tenant IDOR)",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY — the generic sync chokepoint (/v1/sync/pull + /push)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The sync engine (backend/src/sync/engine.ts) is THE single audited chokepoint
// that enforces cross-user isolation for EVERY syncable entity at once — pull/push
// iterate the manifest with no per-entity branching, so one dropped `WHERE user_id`
// would leak or cross-write all tenants' rows across all entities simultaneously.
// The per-resource IDOR blocks above never touch this surface. These cases pin its
// three load-bearing invariants (pull-scope, push-force-identity, collision guard)
// plus its validate-all-then-apply robustness. Each is mutation-tested in the PR to
// confirm teeth (see issue #255 ACs).
describe("DFX · Security — generic sync chokepoint (/v1/sync/pull + /push)", () => {
  let sAlice: { token: string; id: string };
  let sBob: { token: string; id: string };

  // HLC cursors are compared lexicographically; these ISO-microsecond strings
  // sort t1 < t2 < t3 so AC3 can give the attacker a strictly-NEWER timestamp,
  // proving the isolation guard (not LWW) is what blocks the cross-user write.
  const HLC_T1 = "2026-07-02T10:00:00.000000Z";
  const HLC_T2 = "2026-07-02T11:00:00.000000Z";
  const HLC_T3 = "2026-07-02T12:00:00.000000Z";

  /** A minimal but schema-valid `tasks` sync row (four-tuple + NOT-NULL title_en). */
  function taskRow(over: Record<string, unknown>): Record<string, unknown> {
    return { user_id: "ignored-by-server", updated_at: HLC_T1, title_en: "row", ...over };
  }
  const pushTasks = (token: string, rows: Record<string, unknown>[]) =>
    api("POST", "/v1/sync/push", { token, body: { entities: { tasks: rows } } });
  const pullAll = (token: string) => api("POST", "/v1/sync/pull", { token, body: {} });

  /** Find a pulled task row by id, or undefined. */
  const findTask = (entities: Record<string, any[]>, id: string) =>
    (entities?.tasks ?? []).find((r) => r.id === id);
  /** True if ANY manifest entity array in a pull response carries this id. */
  const anyEntityHasId = (entities: Record<string, any[]>, id: string) =>
    Object.values(entities ?? {}).some((rows) => (rows ?? []).some((r: any) => r.id === id));

  before(async () => {
    sAlice = await registerUser("sync-alice");
    sBob = await registerUser("sync-bob");
  });

  test("AC1 — pull is tenant-scoped: Bob never sees Alice's pushed rows; Alice does", async () => {
    const id = "sync-ac1-alice-task";
    const pushed = await pushTasks(sAlice.token, [taskRow({ id, title_en: "ALICE-SECRET" })]);
    assert.equal(pushed.status, 200, "Alice's push should succeed");
    assert.equal(pushed.body.applied, 1, "Alice's row should be applied");

    // Positive control: an empty-body pull is a valid full resync (200) and Alice
    // sees her own row — so the negative assertion below is not vacuously green.
    const alicePull = await pullAll(sAlice.token);
    assert.equal(alicePull.status, 200, "empty-body pull → 200 full resync");
    assert.equal(
      findTask(alicePull.body.entities, id)?.title_en,
      "ALICE-SECRET",
      "Alice's own pull must return her row",
    );

    // Load-bearing: Bob's pull must not contain Alice's row in ANY entity bucket.
    const bobPull = await pullAll(sBob.token);
    assert.equal(bobPull.status, 200);
    assert.equal(
      anyEntityHasId(bobPull.body.entities, id),
      false,
      "Bob's pull must NOT contain Alice's row (drop of WHERE user_id would leak it)",
    );
  });

  test("AC2 — push forces user_id from the JWT: a body-supplied user_id can't cross scopes", async () => {
    const id = "sync-ac2-forced";
    // Bob pushes a row whose BODY claims Alice's user_id.
    const res = await pushTasks(sBob.token, [
      taskRow({ id, user_id: sAlice.id, updated_at: HLC_T2, title_en: "BOB-FORCED" }),
    ]);
    assert.equal(res.status, 200);
    assert.equal(res.body.applied, 1, "the row is written — under Bob, not rejected");

    // It must land under Bob (he can pull it) and NEVER under Alice.
    const bobPull = await pullAll(sBob.token);
    assert.equal(
      findTask(bobPull.body.entities, id)?.title_en,
      "BOB-FORCED",
      "the forced row belongs to Bob (its JWT subject)",
    );
    const alicePull = await pullAll(sAlice.token);
    assert.equal(
      anyEntityHasId(alicePull.body.entities, id),
      false,
      "body user_id must be ignored — the row must NOT appear in Alice's scope",
    );
  });

  test("AC3 — cross-user id-collision guard: Bob cannot overwrite Alice's row by colliding on its id", async () => {
    const id = "sync-ac3-collide";
    // Alice owns the row at HLC_T2.
    const own = await pushTasks(sAlice.token, [taskRow({ id, updated_at: HLC_T2, title_en: "ALICE-OWNED" })]);
    assert.equal(own.body.applied, 1);

    // Bob pushes the SAME id with a strictly-NEWER HLC — LWW alone would say "apply",
    // so only the cross-user guard can stop it. His push must be a no-op (applied 0).
    const hijack = await pushTasks(sBob.token, [taskRow({ id, updated_at: HLC_T3, title_en: "BOB-HIJACK" })]);
    assert.equal(hijack.status, 200);
    assert.equal(hijack.body.applied, 0, "Bob's colliding push must be a no-op, not a cross-user overwrite");

    // Alice's row is untouched (still hers, still her title).
    const alicePull = await pullAll(sAlice.token);
    assert.equal(
      findTask(alicePull.body.entities, id)?.title_en,
      "ALICE-OWNED",
      "Alice's row must survive unchanged (drop of `AND user_id` would let Bob hijack it)",
    );
    // …and Bob did not acquire it.
    const bobPull = await pullAll(sBob.token);
    assert.equal(
      anyEntityHasId(bobPull.body.entities, id),
      false,
      "Bob must not acquire the colliding row",
    );
  });

  test("AC4 — validate-all-then-apply: one bad row → 400 INVALID_ROW and NOTHING is applied", async () => {
    const goodId = "sync-ac4-good";
    // A batch: one valid row + one invalid row. The bad row is well-formed on the
    // WIRE (has the four-tuple, so it passes the route's SyncRowSchema) but omits
    // the NOT-NULL `title_en`, so it fails the engine's per-entity schema — i.e. it
    // exercises the engine's validate-all-then-apply path (INVALID_ROW), not the
    // route-boundary BAD_REQUEST.
    const res = await pushTasks(sAlice.token, [
      taskRow({ id: goodId, updated_at: HLC_T2, title_en: "would-be-applied" }),
      { id: "sync-ac4-bad", user_id: "x", updated_at: HLC_T1 }, // no title_en → engine INVALID_ROW
    ]);
    assert.equal(res.status, 400, "an invalid row fails the whole push with 400");
    assert.equal(res.body.error?.code, "INVALID_ROW", "clean INVALID_ROW envelope, not a 500");

    // The valid sibling must NOT have been applied (all-or-nothing).
    const alicePull = await pullAll(sAlice.token);
    assert.equal(
      anyEntityHasId(alicePull.body.entities, goodId),
      false,
      "a rejected batch must leave zero side effects (validate-all-then-apply)",
    );
  });

  test("AC4 — malformed JSON body → 400 INVALID_JSON (not 500) on push and pull", async () => {
    const bad = "{ this is not json ";
    const p = await rawApi("POST", "/v1/sync/push", bad, sAlice.token);
    assert.equal(p.status, 400, "malformed push body → 400");
    assert.equal(p.body.error?.code, "INVALID_JSON");
    const q = await rawApi("POST", "/v1/sync/pull", bad, sAlice.token);
    assert.equal(q.status, 400, "malformed non-empty pull body → 400 (never a silent full resync)");
    assert.equal(q.body.error?.code, "INVALID_JSON");
  });

  test("AC5 — authn: sync pull/push without a token → 401", async () => {
    const p = await api("POST", "/v1/sync/pull", { body: {} });
    assert.equal(p.status, 401, "unauthenticated pull → 401");
    const q = await api("POST", "/v1/sync/push", { body: { entities: {} } });
    assert.equal(q.status, 401, "unauthenticated push → 401");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for ROBUSTNESS — task `tags` array is length/count-bounded (#282)
//
// Coverage-gap audit (tags feature — tags-v2 stats #278 + tag-autocomplete #281):
// `tags` is a user-supplied, sync-carried, growth-prone array stored on every task
// as the `tags_json` column (and copied into `completed_entries.tags_json` on
// completion). Its only bound is the @lumo/contracts Zod contract:
//   • TagSchema        = z.string().trim().min(1).max(30)  — each tag ≤ 30 chars
//   • tags: z.array(TagSchema).max(20)                     — ≤ 20 tags per task
// Because TaskUpdateBodySchema = TaskCreateBodySchema.partial(), both bounds apply
// on create AND update. There is NO body-size middleware, so these Zod caps are the
// ONLY thing keeping tag rows / sync payloads bounded. Before this block the daily
// DFX suite reached /v1/tasks only for tenant-isolation, malformed-JSON, and
// scalability — the `tags` bounds had zero coverage. A regression loosening
// TagSchema.max(30) or the array .max(20) (or a 5xx on an oversized body instead of
// a clean 400) would let unbounded tag strings/arrays into the column and slip past
// every existing case — surfacing only as row/sync bloat in prod.
//
// Teeth: each rejection asserts the canonical 400 `VALIDATION_ERROR` envelope AND
// that the offending dotted path is named (`tags.0` for the per-element cap, `tags`
// for the array-length cap) — proving the RIGHT bound fired, not an incidental 400.
// Mutation-tested: loosening TagSchema.max(30) reddens exactly the per-element case;
// dropping the array .max(20) reddens exactly the array case; the round-trip stays
// green. Handler/contract already correct → gap in the tests, not the code.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness — task `tags` array is length/count-bounded (#282)", () => {
  test("over-length tag element (> 30 chars) on create → 400 VALIDATION_ERROR naming `tags.0`; server recovers", async () => {
    const { status, body } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Over-long tag" }, quadrant: "Q1", tags: ["x".repeat(31)] },
    });
    assert.equal(status, 400, "an over-length tag must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path.startsWith("tags.0")),
      "the rejection must name the offending tag element (`tags.0`) — the per-tag length cap fired, not an incidental 400",
    );

    // Recoverability: the oversized body must not poison the server — a normal
    // create still succeeds afterwards, proving no crash / no unbounded write.
    const ok = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Right-sized tag" }, quadrant: "Q1", tags: ["work"] },
    });
    assert.equal(ok.status, 201, "server stays healthy after rejecting an over-length tag");
  });

  test("over-cap `tags` array (> 20 elements) on create → 400 naming `tags` (the array-length cap holds)", async () => {
    const tags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    const { status, body } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Too many tags" }, quadrant: "Q2", tags },
    });
    assert.equal(status, 400, "an over-cap tags array must be rejected (no unbounded array write)");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "tags"),
      "the rejection must name `tags` (the array-length cap fired)",
    );
  });

  test("a fully valid `tags` array round-trips verbatim through create → GET /:id", async () => {
    const tags = ["work", "urgent", "q3-goal"];
    const { status, body: created } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Tagged task" }, quadrant: "Q1", tags },
    });
    assert.equal(status, 201);
    const { body: fetched } = await api("GET", `/v1/tasks/${created.id}`, { token: alice.token });
    assert.deepEqual(fetched.tags, tags, "valid tags must persist and reflect back verbatim");
  });

  test("the bound holds on the UPDATE path: over-length tag on PATCH → 400, stored tags left unmutated", async () => {
    // Seed a task with a known-good tag set.
    const { body: task } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Patch-guard task" }, quadrant: "Q1", tags: ["keep"] },
    });
    const patch = await api("PATCH", `/v1/tasks/${task.id}`, {
      token: alice.token,
      body: { tags: ["y".repeat(31)] },
    });
    assert.equal(patch.status, 400, "an over-length tag on PATCH must be rejected (bound applies on update too)");
    assert.equal(patch.body.error?.code, "VALIDATION_ERROR");

    // No partial poison: the rejected PATCH must leave the stored tags untouched.
    const { body: after } = await api("GET", `/v1/tasks/${task.id}`, { token: alice.token });
    assert.deepEqual(after.tags, ["keep"], "a rejected PATCH must not mutate the stored tags");
  });
});
