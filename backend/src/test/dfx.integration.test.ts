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
