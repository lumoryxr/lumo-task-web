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
import { queryOne } from "../db/client.js";
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

function uniqueUsername(tag: string): string {
  // Deterministic per tag (same tag → same username) so a later signin can
  // reconstruct the exact name registerUser used. The auth contract is now
  // username-first, so we derive a VALID username from the test's tag:
  //   • sanitize to the [A-Za-z0-9_-] charset,
  //   • never start/end with a separator,
  //   • keep 3–32 chars (long tags are truncated with a deterministic hash
  //     suffix so distinct long tags stay distinct),
  //   • pad if a tag sanitizes to < 3 chars.
  // No Math.random / Date needed: each tag registers exactly once per run.
  let u = tag.replace(/[^A-Za-z0-9_-]/g, "");
  if (u.length > 32) {
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
    const suffix = h.toString(36).slice(0, 6);
    u = `${u.slice(0, 32 - suffix.length - 1)}-${suffix}`;
  }
  u = u.replace(/^[-_]+/, "").replace(/[-_]+$/, "");
  if (u.length < 3) u = `${u}usr`.slice(0, 3);
  return u;
}

async function registerUser(tag: string): Promise<{ token: string; id: string }> {
  const { status, body } = await api("POST", "/v1/auth/register", {
    body: { username: uniqueUsername(tag), password: "Secret1234!" },
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
      body: { username: uniqueUsername("weak"), password: "short" },
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
// Design for SECURITY & ROBUSTNESS — server-side task search (GET /v1/tasks?q=) (#234)
//
// The search filter (`?q=`) is a DISTINCT SQL builder from the plain task list:
// it appends its own `LIKE :q ESCAPE '\'` clause over title/desc in BOTH locales
// and escapes user-supplied LIKE wildcards (`% _ \`) to literals
// (routes/tasks.ts:120-124). The daily suite exercised the plain list + cursor
// pagination but NEVER this branch, leaving two failure modes uncovered:
//   1. Security/IDOR — a dropped `WHERE user_id` on THIS builder would leak
//      another tenant's task titles/descriptions via `?q=` (info-disclosure).
//   2. Robustness — a dropped wildcard-escape would turn a user's `%`/`_` into
//      SQL wildcards (`?q=%` → "return everything", defeating the filter).
// Handler verified already scoped + escaped → gap in the tests, not the code.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Security & Robustness — task search GET /v1/tasks?q= (#234)", () => {
  let owner: { token: string; id: string };
  let intruder: { token: string; id: string };

  // A keyword rare enough that no other task in the shared DB contains it, so
  // each search below sees only the rows this block creates.
  const RARE = "Zqxwv7Rarekw";

  async function createTask(token: string, titleEn: string): Promise<string> {
    const { status, body } = await api("POST", "/v1/tasks", {
      token,
      body: { title: { en: titleEn }, quadrant: "Q1" },
    });
    assert.equal(status, 201, `create "${titleEn}" should 201`);
    return body.id;
  }

  async function search(token: string, q: string): Promise<any[]> {
    const { status, body } = await api(
      "GET",
      `/v1/tasks?q=${encodeURIComponent(q)}`,
      { token },
    );
    assert.equal(status, 200, `search ?q=${q} should 200`);
    assert.ok(Array.isArray(body.items), "search returns { items: [...] }");
    return body.items;
  }

  before(async () => {
    owner = await registerUser("searchowner");
    intruder = await registerUser("searchintruder");
  });

  test("AC1 · Security — search is tenant-scoped: intruder's ?q= never surfaces the owner's task; owner finds their own", async () => {
    const ownerTaskId = await createTask(owner.token, `${RARE} owner private note`);
    // The intruder holds a task with the SAME rare keyword — proving the filter
    // still matches for them, so the emptiness below is scope, not a dead query.
    await createTask(intruder.token, `${RARE} intruder own task`);

    const intruderHits = await search(intruder.token, RARE);
    assert.ok(
      intruderHits.every((t) => t.id !== ownerTaskId),
      "cross-tenant leak: no owner-owned row may appear in the intruder's search results",
    );

    const ownerHits = await search(owner.token, RARE);
    assert.ok(
      ownerHits.some((t) => t.id === ownerTaskId),
      "the owner's own matching task must be returned (search still works when scoped)",
    );
  });

  test("AC2 · Robustness — literal `%` is escaped, not treated as a match-all wildcard", async () => {
    const pctId = await createTask(owner.token, `${RARE} 50% budget done`);
    const plainId = await createTask(owner.token, `${RARE} plain milestone no percent`);

    // If the escape were dropped, `?q=%` → LIKE `%%%` → matches EVERYTHING the
    // owner has (incl. the plain task and every earlier task in this suite).
    const hits = await search(owner.token, "%");
    const ids = hits.map((t) => t.id);
    assert.ok(ids.includes(pctId), "the task literally containing `%` should match `?q=%`");
    assert.ok(
      !ids.includes(plainId),
      "a task WITHOUT a literal `%` must NOT match `?q=%` (escape has teeth)",
    );
    assert.ok(
      hits.every((t) => (t.title?.en ?? "").includes("%")),
      "every `?q=%` hit must literally contain `%` — not a match-all over the tenant",
    );
  });

  test("AC3 · Robustness — literal `_` is escaped, not treated as a single-char wildcard", async () => {
    const underscoreId = await createTask(owner.token, `${RARE} c_t literal underscore`);
    const catId = await createTask(owner.token, `${RARE} cat animal`);
    const cotId = await createTask(owner.token, `${RARE} cot furniture`);

    // If `_` acted as a LIKE single-char wildcard, `?q=c_t` (`%c_t%`) would also
    // match `cat` and `cot`; escaped (`%c\_t%`) it needs the literal "c_t".
    const hits = await search(owner.token, "c_t");
    const ids = hits.map((t) => t.id);
    assert.ok(ids.includes(underscoreId), "the literal `c_t` task must match `?q=c_t`");
    assert.ok(!ids.includes(catId), "`?q=c_t` must NOT match `cat` (underscore escaped)");
    assert.ok(!ids.includes(cotId), "`?q=c_t` must NOT match `cot` (underscore escaped)");
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

// Some list endpoints are keyset-paginated ({ items, nextCursor }); others still
// return a bare array. Normalize to the row array either way.
const asRows = (body: any): any[] => (Array.isArray(body) ? body : body.items);

describe("DFX · Security — tenant isolation across user-scoped resources (#158)", () => {
  for (const r of TENANT_RESOURCES) {
    test(`${r.name}: attacker cannot PATCH another tenant's row → 404, owner's row survives`, async () => {
      const { status: createStatus, body: row } = await api("POST", r.path, { token: alice.token, body: r.create() });
      assert.equal(createStatus, 201, `${r.name} create should succeed`);

      const patch = await api("PATCH", `${r.path}/${row.id}`, { token: bob.token, body: r.patch });
      assert.equal(patch.status, 404, `${r.name} cross-tenant PATCH must 404 (no IDOR)`);

      // Owner's row must be untouched.
      const { body: list } = await api("GET", r.path, { token: alice.token });
      const still = asRows(list).find((x) => x.id === row.id);
      assert.ok(still, `${r.name} owner's row must still exist after a failed cross-tenant PATCH`);
      const patchedKey = Object.keys(r.patch)[0];
      assert.notEqual(still[patchedKey], (r.patch as any)[patchedKey], `${r.name} owner's field must not be mutated`);
    });

    test(`${r.name}: attacker cannot DELETE another tenant's row → 404`, async () => {
      const { body: row } = await api("POST", r.path, { token: alice.token, body: r.create() });
      const del = await api("DELETE", `${r.path}/${row.id}`, { token: bob.token });
      assert.equal(del.status, 404, `${r.name} cross-tenant DELETE must 404`);

      const { body: list } = await api("GET", r.path, { token: alice.token });
      assert.ok(asRows(list).some((x) => x.id === row.id), `${r.name} owner's row must survive a cross-tenant DELETE`);
    });

    test(`${r.name}: attacker's list never contains the owner's row (tenant-scoped reads)`, async () => {
      const { body: row } = await api("POST", r.path, { token: alice.token, body: r.create() });
      const { status, body: bobList } = await api("GET", r.path, { token: bob.token });
      assert.equal(status, 200);
      const bobRows = asRows(bobList);
      assert.ok(Array.isArray(bobRows), `${r.name} list should expose a row array`);
      assert.ok(!bobRows.some((x) => x.id === row.id), `${r.name} attacker's read must not leak the owner's row`);
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
    assert.ok(Array.isArray(attackerList.items), "countdowns list must be a keyset page { items, nextCursor }");
    assert.ok(
      attackerList.items.some((e: any) => e.id === ownId),
      "attacker's own migrated countdown must be imported",
    );
    // Load-bearing teeth #1: OR REPLACE would rewrite the row's user_id → attacker gains it.
    assert.ok(
      !attackerList.items.some((e: any) => e.id === foreignId),
      "attacker must NOT acquire the victim's countdown by colliding id (OR REPLACE would leak it)",
    );

    // Victim's list: the row must survive UNMUTATED (same title, not the attacker's "STOLEN").
    const { body: victimList } = await api("GET", "/v1/countdowns", { token: victim.token });
    const survivor = victimList.items.find((e: any) => e.id === foreignId);
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
    assert.ok(Array.isArray(attackerList.items), "projects list must expose an items array");
    assert.ok(
      attackerList.items.some((p: any) => p.id === ownId),
      "attacker's own migrated project must be imported",
    );
    assert.ok(
      !attackerList.items.some((p: any) => p.id === foreignId),
      "attacker must NOT acquire the victim's project by colliding id (OR REPLACE would leak it)",
    );

    const { body: victimList } = await api("GET", "/v1/projects", { token: victim.token });
    const survivor = victimList.items.find((p: any) => p.id === foreignId);
    assert.ok(survivor, "victim's project must survive the colliding import");
    assert.equal(survivor.name, "Victim Project", "victim's project content must be unmutated");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY — cross-tenant row id-collision guard on POST /v1/habits/migrate (#306)
//
// The last uncovered member of the migrate-family id-collision guard. #295 covered
// the ROW id-collision for countdowns/migrate + projects/migrate (and its docstring
// even names itself "the sibling of habits/migrate"); #276 covered habits/migrate's
// LOG-ownership guard — but neither covers the habits *table row* itself. Like its
// siblings, habits/migrate INSERTs rows with a CLIENT-SUPPLIED `id` while forcing
// `user_id` from the JWT, into a table keyed on a global `id TEXT PRIMARY KEY`
// (routes/habits.ts:105). The only barrier stopping a caller from clobbering/stealing
// another tenant's habit by supplying its id is the statement's `INSERT OR IGNORE`.
//
// Insidious the same way as #295: the handler returns `migrated: { habits: <submitted>
// .length, … }` (the SUBMITTED count, not the inserted count), so status + count stay
// blind to an `INSERT OR IGNORE` -> `INSERT OR REPLACE` regression (OR REPLACE rewrites
// the colliding row's user_id, letting an attacker STEAL a victim's habit by id). Only
// cross-tenant state-survival catches it — there is no GET /:id, so read back via each
// owner's GET /v1/habits list. Mutation-tested: flipping the habits INSERT to OR REPLACE
// reddens exactly this case.
describe("DFX · Security — cross-tenant id-collision guard on /v1/habits/migrate row (#306)", () => {
  let victim: { token: string; id: string };
  let attacker: { token: string; id: string };

  before(async () => {
    victim = await registerUser("migrate-habit-collide-victim");
    attacker = await registerUser("migrate-habit-collide-attacker");
  });

  test("habits/migrate cannot overwrite or steal another tenant's habit by colliding id", async () => {
    // Victim owns a real habit; its id is what the attacker will try to collide.
    const { status: vStatus, body: victimHabit } = await api("POST", "/v1/habits", {
      token: victim.token,
      body: { title: "Victim Habit", color: "green", frequency: "daily" },
    });
    assert.equal(vStatus, 201, "victim habit should create");
    const foreignId: string = victimHabit.id;

    // Attacker bulk-imports one OWNED habit (positive control) plus one keyed to the
    // VICTIM's id (with different content) — the collision must be ignored, not applied.
    const ownId = "habit_attacker_owned_306";
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
          {
            id: foreignId, // collides with the victim's row
            title: "STOLEN",
            color: "red",
            frequency: "daily",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        logs: [],
      },
    });
    // The endpoint returns the SUBMITTED count regardless — deliberately NOT a teeth
    // assertion (it stays 2 under both OR IGNORE and OR REPLACE); the teeth are below.
    assert.equal(res.status, 200, "migrate should succeed");

    // Attacker's list: must contain their OWN import (positive control — the negative
    // assertion below is not vacuously green) and must NEVER acquire the victim's id.
    const { status: aStatus, body: attackerList } = await api("GET", "/v1/habits", {
      token: attacker.token,
    });
    assert.equal(aStatus, 200);
    // GET /v1/habits is keyset-paginated ({ items, nextCursor }).
    assert.ok(Array.isArray(attackerList.items), "habits list must be a keyset page");
    assert.ok(
      attackerList.items.some((h: any) => h.id === ownId),
      "attacker's own migrated habit must be imported",
    );
    // Load-bearing teeth #1: OR REPLACE would rewrite the row's user_id → attacker gains it.
    assert.ok(
      !attackerList.items.some((h: any) => h.id === foreignId),
      "attacker must NOT acquire the victim's habit by colliding id (OR REPLACE would leak it)",
    );

    // Victim's list: the row must survive UNMUTATED (same title, not the attacker's "STOLEN").
    const { body: victimList } = await api("GET", "/v1/habits", { token: victim.token });
    const survivor = victimList.items.find((h: any) => h.id === foreignId);
    // Load-bearing teeth #2: OR REPLACE moves the row to the attacker → it vanishes here.
    assert.ok(survivor, "victim's habit must survive the colliding import");
    assert.equal(survivor.title, "Victim Habit", "victim's habit content must be unmutated");
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

describe("DFX · Security — public calendar feed capability (#169)", () => {
  // GET /v1/calendar/feed.ics?token=… is the app's ONLY public, unauthenticated,
  // token-as-capability endpoint: the opaque token IS the read capability for a
  // user's open due-tasks + countdown events (the Google/Apple "secret iCal
  // address" model). Its capability-security contract had no presence in this
  // daily real-HTTP + real-file-SQLite suite (only the in-process
  // api/calendar.test.ts exercised it) — the same gap #260/#264/#234 filled for
  // settings/search. A bad guard here silently becomes a cross-tenant leak.
  //
  // The feed queries are scoped `WHERE user_id = :uid` where uid comes from the
  // token → user *hash* lookup (calendar_feed_token_hash), not a JWT — a distinct
  // auth path. `api()` returns the .ics as a text body (Content-Type
  // text/calendar is not application/json), so we assert on that text.

  const A_TASK = "CAL_ALICE_TASK_169";
  const B_TASK = "CAL_BOB_TASK_169";

  before(async () => {
    // Give each actor one open due task so their feed is non-empty.
    await api("POST", "/v1/tasks", { token: alice.token, body: { title: { en: A_TASK }, due: "2026-09-01" } });
    await api("POST", "/v1/tasks", { token: bob.token, body: { title: { en: B_TASK }, due: "2026-09-02" } });
  });

  async function feedTokenFor(token: string): Promise<string> {
    const { status, body } = await api("GET", "/v1/calendar/feed", { token });
    assert.equal(status, 200, "authed GET /v1/calendar/feed should mint/return the feed token");
    assert.ok(typeof body.token === "string" && body.token.length > 0, "feed token must be a non-empty string");
    return body.token;
  }

  test("AC1 · capability isolation — a feed contains only its owner's tasks, never another tenant's", async () => {
    const aliceFeedTok = await feedTokenFor(alice.token);
    const bobFeedTok = await feedTokenFor(bob.token);

    const aliceIcs = await api("GET", `/v1/calendar/feed.ics?token=${encodeURIComponent(aliceFeedTok)}`);
    assert.equal(aliceIcs.status, 200, "Alice's own token must resolve to her feed");
    assert.match(aliceIcs.contentType, /text\/calendar/, "the feed is served as text/calendar");
    // Positive control: Alice's own task is present (emptiness alone would be a false-green).
    assert.ok(aliceIcs.body.includes(A_TASK), "Alice's feed must contain her own task");
    // Load-bearing: Bob's task must NOT appear in Alice's feed.
    assert.ok(!aliceIcs.body.includes(B_TASK), "Alice's feed must NOT leak Bob's task (WHERE user_id scoping)");

    const bobIcs = await api("GET", `/v1/calendar/feed.ics?token=${encodeURIComponent(bobFeedTok)}`);
    assert.equal(bobIcs.status, 200);
    assert.ok(bobIcs.body.includes(B_TASK), "Bob's feed must contain his own task");
    assert.ok(!bobIcs.body.includes(A_TASK), "Bob's feed must NOT leak Alice's task");
  });

  test("AC2 · anti-enumeration — missing and unknown tokens both → 404; a valid token → 200 (no validity oracle)", async () => {
    // Missing token and an unknown/garbage token must be indistinguishable: the
    // endpoint never confirms whether a token is valid (no 401-vs-404 oracle).
    const missing = await api("GET", "/v1/calendar/feed.ics");
    assert.equal(missing.status, 404, "a missing token must be 404 NOT_FOUND");

    const unknown = await api("GET", "/v1/calendar/feed.ics?token=definitely-not-a-real-token-169");
    assert.equal(unknown.status, 404, "an unknown token must be the SAME 404 (never confirm token validity)");

    // Positive control: a real token resolves — proves the 404s are the guard, not a broken route.
    const valid = await feedTokenFor(alice.token);
    const ok = await api("GET", `/v1/calendar/feed.ics?token=${encodeURIComponent(valid)}`);
    assert.equal(ok.status, 200, "a valid token must resolve to 200");
  });

  test("AC3 · rotation revokes — after /feed/rotate the old token → 404, the new token → 200", async () => {
    const oldTok = await feedTokenFor(bob.token);
    // Sanity: the old token resolves before rotation.
    assert.equal(
      (await api("GET", `/v1/calendar/feed.ics?token=${encodeURIComponent(oldTok)}`)).status,
      200,
      "the pre-rotation token should resolve",
    );

    const rot = await api("POST", "/v1/calendar/feed/rotate", { token: bob.token });
    assert.equal(rot.status, 200, "rotate should succeed");
    const newTok: string = rot.body.token;
    assert.ok(newTok && newTok !== oldTok, "rotate must issue a genuinely new token");

    // Revocation: the old token no longer resolves; the new one does.
    assert.equal(
      (await api("GET", `/v1/calendar/feed.ics?token=${encodeURIComponent(oldTok)}`)).status,
      404,
      "the rotated-away token must be revoked (404)",
    );
    assert.equal(
      (await api("GET", `/v1/calendar/feed.ics?token=${encodeURIComponent(newTok)}`)).status,
      200,
      "the freshly-issued token must resolve (200)",
    );
  });
});

describe("DFX · Security — GET /v1/user profile + stats aggregate tenant scoping (#390)", () => {
  // GET /v1/user returns the caller's profile PLUS an aggregate stats block:
  //   stats.tasks     = COUNT(open tasks)  — COUNT(CASE WHEN completed = 0 …)
  //   stats.pomodoros = SUM(pomos_done)    — across the caller's tasks
  // computed by a single query scoped `WHERE user_id = :uid AND deleted_at IS NULL`
  // (routes/user.ts:17-22). Unlike every other user-scoped read — which returns
  // *rows* pinned by the #158 isolation sweep — this is the app's only user-facing
  // cross-tenant *aggregate*: a dropped `WHERE user_id = :uid` on the stats query
  // would silently fold another tenant's open-task + pomodoro counts into the
  // caller's profile — an info-disclosure leak with NO status-code change (still
  // 200), invisible to every existing case. The endpoint had zero presence in this
  // daily real-HTTP + real-file-SQLite suite (only the per-PR in-process api suite
  // exercised it), so a green PR CI is not proof of daily coverage.
  //
  // Fresh dedicated actors (not the shared alice/bob, whose task/pomo counts other
  // tests mutate) so the exact-count assertions are deterministic. `pomos_done` is
  // hardcoded 0 on create — its only write path is POST /v1/focus/sessions (+1 each,
  // rate-limited 10/60s so we keep counts small).

  let owner: { token: string; id: string };
  let other: { token: string; id: string };

  const OWNER_OPEN_TASKS = 3; // + 1 completed → pins the `completed = 0` (open-only) predicate
  const OWNER_POMODOROS = 2;
  const OTHER_OPEN_TASKS = 5; // different, non-zero → positive control for the leak
  const OTHER_POMODOROS = 3;

  async function addPomodoro(token: string, taskId: string): Promise<void> {
    const { status } = await api("POST", "/v1/focus/sessions", {
      token,
      body: { task_id: taskId, duration: 25 },
    });
    assert.equal(status, 200, "recording a focus session should succeed (bumps pomos_done +1)");
  }

  async function createTask(token: string, en: string, quadrant: string): Promise<string> {
    const { status, body } = await api("POST", "/v1/tasks", { token, body: { title: { en }, quadrant } });
    assert.equal(status, 201, `creating task ${en} should succeed`);
    return body.id as string;
  }

  before(async () => {
    owner = await registerUser("profile-owner");
    other = await registerUser("profile-other");

    // Owner: OWNER_OPEN_TASKS open tasks + 1 completed; OWNER_POMODOROS pomodoros.
    let ownerFirst = "";
    for (let i = 0; i < OWNER_OPEN_TASKS; i++) {
      const id = await createTask(owner.token, `owner-open-${i}`, "Q1");
      if (i === 0) ownerFirst = id;
    }
    // One completed owner task so stats.tasks pins open-only, not all rows.
    const ownerDoneId = await createTask(owner.token, "owner-done", "Q1");
    const done = await api("POST", `/v1/tasks/${ownerDoneId}/complete`, { token: owner.token });
    assert.equal(done.status, 200, "completing the owner's task should succeed");
    // Pomodoros accrue on any owned task (SUM is across all the owner's rows).
    for (let i = 0; i < OWNER_POMODOROS; i++) await addPomodoro(owner.token, ownerFirst);

    // Other tenant: DIFFERENT, non-zero counts so a dropped WHERE user_id shows up.
    let otherFirst = "";
    for (let i = 0; i < OTHER_OPEN_TASKS; i++) {
      const id = await createTask(other.token, `other-open-${i}`, "Q2");
      if (i === 0) otherFirst = id;
    }
    for (let i = 0; i < OTHER_POMODOROS; i++) await addPomodoro(other.token, otherFirst);
  });

  test("AC1 · authN required — no token → 401, garbage bearer → 401 (never 500), valid → 200", async () => {
    const noTok = await api("GET", "/v1/user");
    assert.equal(noTok.status, 401, "GET /v1/user without a token must be 401 UNAUTHORIZED");
    assert.equal(noTok.body.error?.code, "UNAUTHORIZED");

    const garbage = await fetch(`${BASE_URL}/v1/user`, { headers: { Authorization: "Bearer not-a-jwt" } });
    assert.equal(garbage.status, 401, "a garbage bearer must be 401, never a 500 crash");

    const ok = await api("GET", "/v1/user", { token: owner.token });
    assert.equal(ok.status, 200, "a valid token must resolve to 200");
  });

  test("AC2 · profile identity — the row is loaded from the JWT owner, not another tenant", async () => {
    const { status, body } = await api("GET", "/v1/user", { token: owner.token });
    assert.equal(status, 200);
    assert.equal(body.username, "profile-owner", "username must be the token-owner's");
    assert.equal(body.email, null, "email is unbound (null) until /bind-email");
    assert.equal(body.name, "profile-owner", "name must be the token-owner's (defaults to the username)");
    assert.equal(body.id, owner.id, "id must be the token-owner's");
  });

  test("AC3 · stats aggregate is tenant-scoped — only the owner's open tasks + pomodoros, never the combined total", async () => {
    const { status, body } = await api("GET", "/v1/user", { token: owner.token });
    assert.equal(status, 200);
    // Load-bearing: EXACTLY the owner's own counts. The completed owner task is
    // excluded (open-only), and the other tenant's tasks/pomodoros are NOT folded
    // in. Dropping `WHERE user_id = :uid` on the aggregate inflates both numbers
    // (to at least owner+other) → reddens exactly this case.
    assert.equal(body.stats.tasks, OWNER_OPEN_TASKS,
      `stats.tasks must be the owner's ${OWNER_OPEN_TASKS} OPEN tasks — excludes the completed one, excludes the other tenant's ${OTHER_OPEN_TASKS}`);
    assert.equal(body.stats.pomodoros, OWNER_POMODOROS,
      `stats.pomodoros must be the owner's ${OWNER_POMODOROS} — never the other tenant's ${OTHER_POMODOROS} folded in`);

    // Positive control: the OTHER tenant sees its OWN distinct counts — proves both
    // tenants hold real, different, non-zero data, so the owner assertion above
    // isn't passing merely because the other tenant is empty.
    const otherView = await api("GET", "/v1/user", { token: other.token });
    assert.equal(otherView.status, 200);
    assert.equal(otherView.body.stats.tasks, OTHER_OPEN_TASKS, "the other tenant sees its own open-task count");
    assert.equal(otherView.body.stats.pomodoros, OTHER_POMODOROS, "the other tenant sees its own pomodoro count");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY — next-task recommender POST /v1/ai/recommend tenant isolation (#398)
//
// `/ai/recommend` is the one AI *mutation* endpoint with zero prior DFX-suite
// presence (classify/parse/breakdown/chat all have cases; recommend was only in
// a comment). It READS the caller's Q1+today open tasks
//   `SELECT … FROM tasks WHERE user_id = :uid AND completed = 0
//        AND deleted_at IS NULL AND quadrant = 'Q1' AND today = 1`
// and WRITES the chosen task's conviction —
//   `UPDATE tasks SET conviction = …, updated_at = … WHERE id = :id AND user_id = :uid`.
// The heuristic fallback runs that UPDATE even with **no LLM configured**, so the
// whole path is verifiable here without an AI provider.
//
// The insidious IDOR class: recommend returns `{ task: null }` when the caller has
// no Q1+today task — so a dropped read-scope would hand a task-less caller ANOTHER
// tenant's Q1 task with NO status-code change (still 200), invisible to every other
// case; only a "task-less caller gets null, not the victim's task" assertion catches
// it (same shape as the #190 focus/sessions footgun). A dropped write-scope would let
// one tenant's recommend mutate another tenant's conviction/updated_at.
// Handler verified already scoped by `user_id` on both the read and the write →
// gap in the tests, not the code (test + docs only, no production change).
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Security — next-task recommender POST /v1/ai/recommend tenant isolation (#398)", () => {
  // Fresh dedicated actors (not shared alice/bob, whose tasks other tests mutate)
  // so the null / unchanged-row assertions are deterministic.
  let recOwner: { token: string; id: string };
  let recAttacker: { token: string; id: string };
  let ownerTaskId: string;

  before(async () => {
    recOwner = await registerUser("rec-owner");
    recAttacker = await registerUser("rec-attacker");
    // Owner has exactly one Q1 + today task; recommend must be able to surface it.
    const { status, body } = await api("POST", "/v1/tasks", {
      token: recOwner.token,
      body: { title: { en: "Owner Q1 today" }, quadrant: "Q1", today: true },
    });
    assert.equal(status, 201, "owner Q1 task should be created");
    ownerTaskId = body.id;
  });

  test("AC1 — a task-less attacker's recommend returns { task: null }, never the owner's task", async () => {
    // Positive control: the owner's own recommend surfaces the owner's task, so a
    // null below means "correctly scoped out", not "endpoint returns null for all".
    const own = await api("POST", "/v1/ai/recommend", { token: recOwner.token, body: {} });
    assert.equal(own.status, 200);
    assert.equal(own.body.task?.id, ownerTaskId, "owner should be recommended their own Q1 task");

    // Load-bearing: attacker has NO Q1+today task → must get null, not a leaked task.
    const res = await api("POST", "/v1/ai/recommend", { token: recAttacker.token, body: {} });
    assert.equal(res.status, 200);
    assert.equal(res.body.task, null, "task-less attacker must get null — a dropped read WHERE user_id would leak the owner's Q1 task here");
  });

  test("AC2 — the recommend write is caller-scoped: the owner's row is byte-for-byte unchanged when the attacker recommends", async () => {
    // Snapshot the owner's task AFTER the owner's AC1 recommend already bumped it.
    const before = await api("GET", `/v1/tasks/${ownerTaskId}`, { token: recOwner.token });
    assert.equal(before.status, 200);
    const ownerConvictionBefore = before.body.conviction;
    const ownerUpdatedAtBefore = before.body.updated_at;

    // Give the attacker their own Q1+today task so recommend has something to write to.
    const mk = await api("POST", "/v1/tasks", {
      token: recAttacker.token,
      body: { title: { en: "Attacker Q1 today" }, quadrant: "Q1", today: true },
    });
    assert.equal(mk.status, 201);
    const attackerTaskId = mk.body.id;

    const rec = await api("POST", "/v1/ai/recommend", { token: recAttacker.token, body: {} });
    assert.equal(rec.status, 200);
    assert.equal(rec.body.task?.id, attackerTaskId, "attacker must be recommended their OWN task, never the owner's");

    // The owner's row must be untouched — the UPDATE … WHERE user_id never reached it.
    const after = await api("GET", `/v1/tasks/${ownerTaskId}`, { token: recOwner.token });
    assert.equal(after.status, 200);
    assert.equal(after.body.conviction, ownerConvictionBefore, "owner's conviction must be unchanged by the attacker's recommend");
    assert.equal(after.body.updated_at, ownerUpdatedAtBefore, "owner's updated_at (LWW/cursor key) must be unchanged — no cross-tenant write");
  });

  test("AC3 — authn: no token → 401 UNAUTHORIZED; a garbage bearer → 401 (never 500)", async () => {
    const noToken = await api("POST", "/v1/ai/recommend", { body: {} });
    assert.equal(noToken.status, 401);
    assert.equal(noToken.body.error?.code, "UNAUTHORIZED");

    for (const bad of ["Bearer not-a-jwt", "Bearer aaa.bbb.ccc"]) {
      const res = await fetch(`${BASE_URL}/v1/ai/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: bad },
        body: "{}",
      });
      assert.equal(res.status, 401, `garbage bearer "${bad}" must 401, never 500`);
    }
  });

  test("AC4 — robustness/recoverability: an unknown body field → 400 VALIDATION_ERROR, and a normal recommend still works after", async () => {
    // Body schema is z.object({}).strict() → an extra key is a hard 400, not a 5xx.
    const bad = await api("POST", "/v1/ai/recommend", { token: recOwner.token, body: { surprise: true } });
    assert.equal(bad.status, 400, "unknown body field must be rejected 400, never 5xx");
    assert.equal(bad.body.error?.code, "VALIDATION_ERROR");

    // The bad request never poisoned the server — the owner's recommend still succeeds.
    const ok = await api("POST", "/v1/ai/recommend", { token: recOwner.token, body: {} });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.task?.id, ownerTaskId, "server recovered — owner recommend still returns the owner's task");
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
// Design for ROBUSTNESS — bounded OKR/KPI goal fields on /v1/projects (#304)
//
// Coverage-gap audit (#304): #290/#291 grew each project goal from a plain
// {text, done} checkbox into an OKR Key Result — adding `target` / `current` /
// `start` (z.number().finite().nonnegative()), `unit` (z.string().max(12)), and
// `confidence` (enum on_track|at_risk|off_track). These are user-supplied,
// sync-carried, and stored in the goals_json column with NO body-size middleware,
// so the Zod field bounds are the only guard. The #213/#219 block above covers a
// goal's `text` / the `goals` array / `content` — the NEW KPI fields had zero
// robustness coverage. Because ProjectUpdateBody = ProjectBody.partial(), the same
// GoalSchema validates goals on BOTH create and update, so a rejection must also
// leave a stored KR unmutated (no partial poison of a baseline the client renders).
//
// Teeth: each rejection asserts the 400 VALIDATION_ERROR envelope AND that the
// offending dotted `goals.0.<field>` path is named (proving the RIGHT bound fired,
// not an incidental 400); the valid case round-trips every KPI field verbatim
// through the owner's list; the PATCH case proves the stored KR survives unmutated.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness — bounded OKR/KPI goal fields on /v1/projects (#304)", () => {
  test("over-length `goals[].unit` (> 12) → 400 VALIDATION_ERROR naming goals.0.unit", async () => {
    const { status, body } = await api("POST", "/v1/projects", {
      token: alice.token,
      body: { name: "Bad unit", goals: [{ text: "Ship revenue", target: 100, unit: "x".repeat(13) }] },
    });
    assert.equal(status, 400, "an over-length KPI unit must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path.startsWith("goals.0.unit")),
      "the rejection must name `goals.0.unit` (the 12-char cap fired inside the goal element, not an incidental 400)",
    );
  });

  test("negative `goals[].target` (violates nonnegative) → 400 naming goals.0.target", async () => {
    const { status, body } = await api("POST", "/v1/projects", {
      token: alice.token,
      body: { name: "Negative target", goals: [{ text: "KR", target: -5 }] },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path.startsWith("goals.0.target")),
      "the rejection must name `goals.0.target` (the nonnegative bound fired, not an incidental 400)",
    );
  });

  test("out-of-enum `goals[].confidence` → 400 naming goals.0.confidence", async () => {
    const { status, body } = await api("POST", "/v1/projects", {
      token: alice.token,
      body: { name: "Bad confidence", goals: [{ text: "KR", confidence: "definitely" }] },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path.startsWith("goals.0.confidence")),
      "the rejection must name `goals.0.confidence` (the enum bound fired)",
    );
  });

  test("valid KPI goal round-trips verbatim; a rejected PATCH leaves the stored KR unmutated (no partial poison)", async () => {
    // A fully-specified Key Result creates cleanly — proving it was the bound,
    // not the KR shape, that rejected the cases above.
    const created = await api("POST", "/v1/projects", {
      token: alice.token,
      body: { name: "Q3 revenue", goals: [{ text: "Grow MRR", start: 20, current: 40, target: 100, unit: "万", confidence: "on_track" }] },
    });
    assert.equal(created.status, 201, "a fully-valid KPI goal must create");
    const pid = created.body.id as string;

    // ...and round-trips every KPI field verbatim through the owner's list (no GET /:id).
    const listed = await api("GET", "/v1/projects", { token: alice.token });
    const mine = (listed.body.items as Array<{ id: string; goals: Array<Record<string, unknown>> }>).find((p) => p.id === pid);
    assert.ok(mine, "the created project appears in the owner's list");
    const g = mine!.goals[0];
    assert.equal(g.start, 20);
    assert.equal(g.current, 40);
    assert.equal(g.target, 100);
    assert.equal(g.unit, "万");
    assert.equal(g.confidence, "on_track");

    // The same GoalSchema validates goals on PATCH (ProjectUpdateBody is a
    // .partial()), so an over-length unit is rejected — and must not poison the store.
    const bad = await api("PATCH", `/v1/projects/${pid}`, {
      token: alice.token,
      body: { goals: [{ text: "Grow MRR", start: 20, current: 40, target: 100, unit: "x".repeat(13), confidence: "on_track" }] },
    });
    assert.equal(bad.status, 400, "an over-length unit on PATCH must be rejected");
    assert.equal(bad.body.error?.code, "VALIDATION_ERROR");

    const after = await api("GET", "/v1/projects", { token: alice.token });
    const still = (after.body.items as Array<{ id: string; goals: Array<Record<string, unknown>> }>).find((p) => p.id === pid);
    assert.equal(still!.goals[0].current, 40, "the stored KR is unmutated after the rejected PATCH (no partial poison)");
    assert.equal(still!.goals[0].unit, "万", "the stored unit survives the rejected PATCH");
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
// Design for RELIABILITY — PATCH /v1/templates wrong-kind payload → 400 not 5xx (#395)
//
// Coverage-gap + real-defect audit (#395): `TemplateUpdateBodySchema.payload` is a
// BARE `z.union([TemplatePayloadSchema, ProjectTemplatePayloadSchema])` — it accepts
// EITHER kind's payload shape regardless of the template's actual kind. The PATCH
// handler then re-encodes the payload against the template's EFFECTIVE kind via
// `payloadSchemaFor(effectiveKind).safeParse(...)`. Before the #395 fix that call
// was a `.parse()`, so a payload matching the *other* kind passed the request
// validator, then threw a raw ZodError at the re-encode — and because routes never
// throw HTTPException, `app.onError` turned it into a 500 INTERNAL_ERROR. A
// DFX Reliability violation: mismatched input must degrade to a clean 4xx, never a
// 5xx. The CREATE path is safe (its union variants pin kind↔payload together, so
// the re-parse always matches) — only UPDATE decouples them.
//
// Both directions get teeth (task-kind ← project payload AND project-kind ← task
// payload), each pairs the 400 with a read-back proving the stored row is
// UNMUTATED (no partial poison), and a same-kind PATCH still succeeds (200 +
// persists) so we prove it was the KIND MISMATCH that rejected, not a broken
// update path.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Reliability — PATCH /v1/templates wrong-kind payload → 400, never 5xx (#395)", () => {
  let tplUser: { token: string; id: string };

  before(async () => {
    tplUser = await registerUser("tpl-patch-kind-395");
  });

  // No GET /:id — read a template back through the owner's list.
  async function getTemplate(token: string, id: string): Promise<any> {
    const { body } = await api("GET", "/v1/templates", { token });
    return (body as any[]).find((t) => t.id === id);
  }

  test("PATCH a task-kind template with a valid PROJECT-shaped payload → 400 VALIDATION_ERROR (never 5xx); row unmutated", async () => {
    // A task template (kind defaults to "task").
    const created = await api("POST", "/v1/templates", {
      token: tplUser.token,
      body: { name: "Task tpl A", payload: { title: { en: "Original task title" } } },
    });
    assert.equal(created.status, 201);
    const id = created.body.id as string;

    // A payload that is a VALID *project* blueprint (has `name`, lacks `title`) —
    // it passes the request-body union but is the wrong kind for this template.
    const { status, body } = await api("PATCH", `/v1/templates/${id}`, {
      token: tplUser.token,
      body: { payload: { name: "Project shaped", goals: [{ text: "g" }] } },
    });
    assert.equal(status, 400, "a wrong-kind payload must degrade to a client error, not a 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path.startsWith("payload.")),
      "the rejection must name the offending payload field (the task-schema re-parse fired, e.g. payload.title)",
    );

    // No-poison: the stored template is untouched (still its original task payload).
    const after = await getTemplate(tplUser.token, id);
    assert.equal(after.kind, "task", "kind must be unchanged");
    assert.equal(after.payload?.title?.en, "Original task title", "payload must be unmutated after the rejected PATCH");
  });

  test("PATCH a project-kind template with a valid TASK-shaped payload → 400 VALIDATION_ERROR (never 5xx); row unmutated", async () => {
    const created = await api("POST", "/v1/templates", {
      token: tplUser.token,
      body: { name: "Project tpl B", kind: "project", payload: { name: "Original project name" } },
    });
    assert.equal(created.status, 201);
    const id = created.body.id as string;

    // A valid *task* blueprint (has `title`, lacks `name`) — wrong kind here.
    const { status, body } = await api("PATCH", `/v1/templates/${id}`, {
      token: tplUser.token,
      body: { payload: { title: { en: "Task shaped" } } },
    });
    assert.equal(status, 400, "a wrong-kind payload must degrade to a client error, not a 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path.startsWith("payload.")),
      "the rejection must name the offending payload field (the project-schema re-parse fired, e.g. payload.name)",
    );

    const after = await getTemplate(tplUser.token, id);
    assert.equal(after.kind, "project", "kind must be unchanged");
    assert.equal(after.payload?.name, "Original project name", "payload must be unmutated after the rejected PATCH");
  });

  test("PATCH with a valid SAME-kind payload still succeeds (200) and persists — no regression", async () => {
    const created = await api("POST", "/v1/templates", {
      token: tplUser.token,
      body: { name: "Task tpl C", payload: { title: { en: "Before" } } },
    });
    assert.equal(created.status, 201);
    const id = created.body.id as string;

    const { status, body } = await api("PATCH", `/v1/templates/${id}`, {
      token: tplUser.token,
      body: { payload: { title: { en: "After" } } },
    });
    assert.equal(status, 200, "a matching-kind payload replace must succeed");
    assert.equal(body.payload?.title?.en, "After", "the response reflects the replaced payload");

    // Persisted (the handler re-reads from the DB before responding, but confirm
    // via the list too that the write landed).
    const after = await getTemplate(tplUser.token, id);
    assert.equal(after.payload?.title?.en, "After", "the replaced payload is persisted");
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

// Design for ROBUSTNESS — task `due` date anchor is format-bounded (#319)
//
// Coverage-gap audit (task write boundary temporal fields, #319): sibling of the
// `remind_at` block above. `tasks.due` (#177) is the STRICT DATE-ONLY ISO anchor
// (`^\d{4}-\d{2}-\d{2}$`, on create + partial update) that drives due-date display
// / sorting and the planned due-date reminders. The regex is the ONLY barrier
// between a client and a junk value landing in the column — a regression loosening
// it to `z.string()` (or dropped) would let `"tomorrow"` / a full-datetime string
// into storage and slip past every existing case, surfacing only as a mis-sorted
// due list in prod. Before this block `due` had no daily integration/DFX coverage
// (only a fast in-process contract unit test + a happy-path api test).
//
// Gives the bound teeth on BOTH write paths (create + update) and proves the
// round-trip: malformed → clean 400 (never 5xx / silent write), a valid value
// persists + reflects back via `GET /v1/tasks/:id`, and a bad PATCH leaves the
// stored date unmutated (no partial poison).
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness — task `due` date anchor is format-bounded (#319)", () => {
  test("malformed `due` on create → 400 VALIDATION_ERROR naming the field, never a 5xx / write", async () => {
    const { status, body } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Bad due" }, quadrant: "Q1", due: "tomorrow" },
    });
    assert.equal(status, 400, "a junk due value must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "due"),
      "the rejection must name `due` (the format bound fired, not an incidental 400)",
    );
  });

  test("full-datetime `due` (a valid `scheduled_start`/`remind_at` shape) → 400 — the date-only bound has teeth", async () => {
    // `"2026-12-01T09:30"` is a valid `scheduled_start`/`remind_at` value but NOT a
    // valid `due`: the due anchor is date-only, so the regex forbids a time
    // component. Proves the bound rejects a plausible-but-wrong-shape value, not
    // just garbage.
    const { status, body } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Datetime due" }, quadrant: "Q1", due: "2026-12-01T09:30" },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "due"),
      "a datetime where a date is required must still name `due`",
    );
  });

  test("valid `due` round-trips — create persists it and a read reflects it back", async () => {
    const due = "2026-12-01";
    const { status, body: created } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Ship it" }, quadrant: "Q1", due },
    });
    assert.equal(status, 201, "a well-formed due date must be accepted");
    assert.equal(created.due, due, "the create response must echo the stored due date");

    const read = await api("GET", `/v1/tasks/${created.id}`, { token: alice.token });
    assert.equal(read.status, 200);
    assert.equal(read.body.due, due, "a subsequent read must reflect the persisted due date");
  });

  test("malformed `due` on PATCH → 400 and the stored value is left unmutated", async () => {
    const good = "2026-12-02";
    const { body: created } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Patch due target" }, quadrant: "Q1", due: good },
    });

    const { status, body } = await api("PATCH", `/v1/tasks/${created.id}`, {
      token: alice.token,
      body: { due: "not-a-date" },
    });
    assert.equal(status, 400, "the update path must validate `due` too");
    assert.equal(body.error?.code, "VALIDATION_ERROR");

    const read = await api("GET", `/v1/tasks/${created.id}`, { token: alice.token });
    assert.equal(read.status, 200);
    assert.equal(read.body.due, good, "a rejected update must leave the stored due date unchanged");
  });
});

// Design for ROBUSTNESS — task `scheduled_start` slot anchor is format-bounded (#319)
//
// Coverage-gap audit (task write boundary temporal fields, #319): the third
// format-bounded temporal field on the task write boundary (with `remind_at` and
// `due`), and the one with NO prior format-bound coverage at all. `scheduled_start`
// is the day-plan slot — a wall-clock DATETIME anchor
// (`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$`, same shape as `remind_at`, on create
// + partial update) that places a task on the schedule. The regex is the sole guard
// between a client and a junk value in the column the scheduler reads to position
// the task — a regression loosening it to `z.string()` would let a date-only value
// / garbage into storage and slip past every existing case, surfacing only as a
// task that can't be placed on the day plan in prod.
//
// Gives the bound teeth on BOTH write paths (create + update) and proves the
// round-trip: malformed → clean 400 (never 5xx / silent write), a valid value
// persists + reflects back via `GET /v1/tasks/:id`, and a bad PATCH leaves the
// stored slot unmutated (no partial poison).
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness — task `scheduled_start` slot anchor is format-bounded (#319)", () => {
  test("malformed `scheduled_start` on create → 400 VALIDATION_ERROR naming the field, never a 5xx / write", async () => {
    const { status, body } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Bad slot" }, quadrant: "Q1", scheduled_start: "someday" },
    });
    assert.equal(status, 400, "a junk schedule slot must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "scheduled_start"),
      "the rejection must name `scheduled_start` (the format bound fired, not an incidental 400)",
    );
  });

  test("date-only `scheduled_start` (no time component) → 400 — the full-datetime bound has teeth", async () => {
    // `"2026-12-01"` is a valid `due` date but NOT a valid `scheduled_start`: the
    // schedule slot needs a wall-clock time, so the regex demands `T HH:MM`. Proves
    // the bound rejects a plausible-but-incomplete value, not just garbage.
    const { status, body } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Date only slot" }, quadrant: "Q1", scheduled_start: "2026-12-01" },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "scheduled_start"),
      "a date with no time must still name `scheduled_start`",
    );
  });

  test("valid `scheduled_start` round-trips — create persists it and a read reflects it back", async () => {
    const slot = "2026-12-01T14:15";
    const { status, body: created } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Deep work" }, quadrant: "Q1", scheduled_start: slot },
    });
    assert.equal(status, 201, "a well-formed schedule slot must be accepted");
    assert.equal(created.scheduled_start, slot, "the create response must echo the stored slot");

    const read = await api("GET", `/v1/tasks/${created.id}`, { token: alice.token });
    assert.equal(read.status, 200);
    assert.equal(read.body.scheduled_start, slot, "a subsequent read must reflect the persisted slot");
  });

  test("malformed `scheduled_start` on PATCH → 400 and the stored value is left unmutated", async () => {
    const good = "2026-12-02T08:45";
    const { body: created } = await api("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "Patch slot target" }, quadrant: "Q1", scheduled_start: good },
    });

    const { status, body } = await api("PATCH", `/v1/tasks/${created.id}`, {
      token: alice.token,
      body: { scheduled_start: "not-a-datetime" },
    });
    assert.equal(status, 400, "the update path must validate `scheduled_start` too");
    assert.equal(body.error?.code, "VALIDATION_ERROR");

    const read = await api("GET", `/v1/tasks/${created.id}`, { token: alice.token });
    assert.equal(read.status, 200);
    assert.equal(read.body.scheduled_start, good, "a rejected update must leave the stored slot unchanged");
  });
});

// Design for ROBUSTNESS — focus-session `started_at` anchor is format-bounded (#402)
//
// Coverage-gap audit (datetime anchors): `POST /v1/focus/sessions` records a
// pomodoro. Its optional `started_at` timestamp is persisted verbatim into
// `completed_entries.started_at` (read back as `startedAt` on GET /v1/completed).
// The endpoint had DFX SECURITY coverage (cross-tenant IDOR, #190) but NO
// robustness/input-bounds coverage: the field was bound as a bare
// `z.string().optional()` — any string accepted — which (a) contradicts the
// endpoint's OWN published contract (routes/docs.ts declares it
// `format: date-time`) and (b) is inconsistent with every other datetime anchor
// in the app, all of which are format-bounded (task scheduled_start/remind_at/due
// #319, countdown date #240, habit check-in date #267, settings reminder-time
// #264). A regression relaxing the bound would let garbage / oversized timestamps
// into stored history with no status-code change.
//
// The bound is a SUPERSET regex accepting both the client's real wire format
// (`new Date().toISOString()` → `…THH:MM:SS.sssZ`, used by the existing api test)
// and the app-wide `scheduled_start` shape (`YYYY-MM-DDTHH:MM`), so nothing
// currently valid is newly rejected. It rejects free-form junk and a date-only
// value (no time component) — the same "has teeth" property as scheduled_start.
// Validated by `validate("json", FocusSessionBody)` BEFORE the write, so a bad
// anchor is a clean 400, never a 5xx or a poisoned row. Uses dedicated actors so
// the per-user focus rate-limit (10/min) can't couple to other blocks.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness — focus-session `started_at` anchor is format-bounded (#402)", () => {
  let fowner: { token: string; id: string };

  before(async () => {
    fowner = await registerUser("focus-startedat");
  });

  test("malformed `started_at` → 400 VALIDATION_ERROR naming the field, no poisoned entry, server survives (recoverability)", async () => {
    const before = await api("GET", "/v1/completed", { token: fowner.token });
    const beforeCount = (before.body.items as unknown[]).length;

    const { status, body } = await api("POST", "/v1/focus/sessions", {
      token: fowner.token,
      body: { duration: 25, started_at: "someday" },
    });
    assert.equal(status, 400, "a junk timestamp must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "started_at"),
      "the rejection must name `started_at` (the format bound fired, not an incidental 400)",
    );

    // No poison: the rejected request must not have written a completed entry.
    const after = await api("GET", "/v1/completed", { token: fowner.token });
    assert.equal((after.body.items as unknown[]).length, beforeCount, "a rejected session must not persist an entry");

    // Recoverability: the next well-formed request still succeeds.
    const ok = await api("POST", "/v1/focus/sessions", { token: fowner.token, body: { duration: 5 } });
    assert.equal(ok.status, 200, "server survives the bad request; the next valid one works");
  });

  test("date-only `started_at` (no time component) → 400 — the datetime bound has teeth", async () => {
    const { status, body } = await api("POST", "/v1/focus/sessions", {
      token: fowner.token,
      body: { duration: 25, started_at: "2026-07-08" },
    });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "started_at"),
      "a date with no time must still name `started_at`",
    );
  });

  test("valid full-ISO `started_at` (toISOString) is accepted and round-trips onto GET /completed", async () => {
    const { body: task } = await api("POST", "/v1/tasks", {
      token: fowner.token,
      body: { title: { en: "Deep work" }, quadrant: "Q1", pomos_total: 2 },
    });
    const startedAt = "2026-07-08T03:46:00.000Z"; // exactly new Date().toISOString() shape

    const { status } = await api("POST", "/v1/focus/sessions", {
      token: fowner.token,
      body: { task_id: task.id, duration: 25, started_at: startedAt },
    });
    assert.equal(status, 200, "a well-formed ISO timestamp must be accepted (no happy-path regression)");

    const read = await api("GET", "/v1/completed", { token: fowner.token });
    const entry = (read.body.items as Array<{ task_id: string | null; startedAt: string | null }>).find(
      (e) => e.task_id === task.id,
    );
    assert.ok(entry, "the focus session must produce a completed entry");
    assert.equal(entry?.startedAt, startedAt, "a subsequent read must reflect the persisted anchor");
  });

  test("app-form `started_at` (YYYY-MM-DDTHH:MM, the scheduled_start shape) is also accepted (superset bound)", async () => {
    const { status } = await api("POST", "/v1/focus/sessions", {
      token: fowner.token,
      body: { duration: 25, started_at: "2026-12-01T14:15" },
    });
    assert.equal(status, 200, "the app-wide datetime shape must remain valid — nothing currently valid is newly rejected");
  });
});

// Design for ROBUSTNESS — focus-session `duration` is range-bounded [1, 1440] (#405)
//
// Coverage-gap audit (magnitude bounds): the same #402 focus-log write path had its
// datetime anchor bounded but left `duration` as `z.number().int().min(1)` — no
// UPPER bound. That minutes value is persisted verbatim into
// `completed_entries.duration` and SUMMED into Stats totals (GET /v1/completed →
// dashboards), so a single overflow-shaped session (e.g. 9_999_999) silently
// dwarfs every real total with no status-code change — the classic unbounded-
// magnitude footgun. Every sibling minutes field is already capped at 1440 (=24h):
// `tasks.duration` and the task/project-template `payload.duration` (contract
// task.ts/template.ts, exercised by the #211/#184 DFX cases above). A pomodoro
// longer than a day is junk; bound it at the request boundary so the poison never
// reaches the row. Validated by `validate("json", FocusSessionBody)` BEFORE the
// write → a bad magnitude is a clean 400, never a 5xx or a poisoned Stats total.
// Dedicated actor so the per-user focus rate-limit (10/min) can't couple to other
// blocks.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness/Scalability — focus-session `duration` is range-bounded [1,1440] (#405)", () => {
  let fdur: { token: string; id: string };

  before(async () => {
    fdur = await registerUser("focus-duration");
  });

  test("oversized `duration` → 400 VALIDATION_ERROR naming the field, no poisoned Stats total, server survives", async () => {
    const before = await api("GET", "/v1/completed", { token: fdur.token });
    const beforeCount = (before.body.items as unknown[]).length;

    const { status, body } = await api("POST", "/v1/focus/sessions", {
      token: fdur.token,
      body: { duration: 9_999_999 },
    });
    assert.equal(status, 400, "an absurd duration must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "duration"),
      "the rejection must name `duration` (the range bound fired, not an incidental 400)",
    );

    // No poison: the rejected request must not have written a completed entry that
    // would inflate the summed Stats total.
    const after = await api("GET", "/v1/completed", { token: fdur.token });
    assert.equal((after.body.items as unknown[]).length, beforeCount, "a rejected oversized session must not persist an entry");

    // Recoverability: the next in-range request still succeeds.
    const ok = await api("POST", "/v1/focus/sessions", { token: fdur.token, body: { duration: 5 } });
    assert.equal(ok.status, 200, "server survives the bad request; the next valid one works");
  });

  test("oversized `duration` with a task_id does not bump the task's pomos_done (rejected before the write)", async () => {
    const { body: task } = await api("POST", "/v1/tasks", {
      token: fdur.token,
      body: { title: { en: "Overflow guard" }, quadrant: "Q1", pomos_total: 4 },
    });
    const { status } = await api("POST", "/v1/focus/sessions", {
      token: fdur.token,
      body: { task_id: task.id, duration: 9_999_999 },
    });
    assert.equal(status, 400);

    const read = await api("GET", `/v1/tasks/${task.id}`, { token: fdur.token });
    assert.equal(read.body.pomos_done, 0, "a rejected oversized session must not advance pomos_done");
  });

  test("boundary `duration` = 1440 (24h) is accepted — the cap is inclusive, no happy-path regression", async () => {
    const { status, body } = await api("POST", "/v1/focus/sessions", {
      token: fdur.token,
      body: { duration: 1440 },
    });
    assert.equal(status, 200, "exactly 24h must remain valid — the bound is a ceiling, not an off-by-one");
    assert.equal(body.ok, true);
  });
});

// Design for ROBUSTNESS — NL-capture input bounds on POST /v1/ai/parse (#305)
//
// Coverage-gap audit (AI request surfaces): `/v1/ai/parse` is the natural-language
// quick-capture endpoint ("type a task in plain English") and the foundation of the
// Phase-3 NL+AI-planning proposal. Sibling AI surfaces are covered for IDOR
// (`/ai/breakdown` #209, `/ai/classify` #249) but the `/ai/parse` INPUT BOUNDS had
// no daily DFX coverage. Its body is validated by `validate("json", ParseBody)`
// (routes/ai.ts:300-303) BEFORE any LLM call, with two load-bearing bounds:
//   • `text: z.string().min(1).max(500)` — the free text injected verbatim into the
//     prompt (`Input: "${text}"`). The `max(500)` cap is the ONLY bound on how much
//     attacker-controlled text reaches the model (prompt-cost / oversized-input
//     surface); `min(1)` rejects an empty capture.
//   • `locale: z.enum(["en","zh"]).optional()` — steers the prompt's language note.
// A regression loosening `text` to `z.string()` (unbounded prompt input) or dropping
// the `locale` enum would slip past every existing case, surfacing only as runaway
// LLM cost / a malformed prompt in prod.
//
// `/ai/parse` has a graceful no-LLM fallback: with no provider configured (as in the
// daily ephemeral harness) a VALID request returns 200 with a deterministic
// `{ title: text.trim(), quadrant:"unclassified", confidence:0 }` — so BOTH the 400
// (bad input, before any LLM call) and the 200 (valid input degrades gracefully,
// never a 5xx) paths are fully verifiable with no AI provider. Uses a dedicated
// actor so the per-user classify rate-limit (20/min) can't couple to other blocks.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness — NL-capture input bounds on POST /v1/ai/parse (#305)", () => {
  let parseUser: { token: string; id: string };
  before(async () => {
    parseUser = await registerUser("parse305");
  });

  test("AC1 · over-cap `text` (> 500 chars) → 400 VALIDATION_ERROR naming `text`, before any LLM call", async () => {
    const { status, body } = await api("POST", "/v1/ai/parse", {
      token: parseUser.token,
      body: { text: "a".repeat(501) },
    });
    assert.equal(status, 400, "an over-cap capture must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "text"),
      "the rejection must name `text` (the prompt-size bound fired, not an incidental 400)",
    );
  });

  test("AC2 · empty `text` (`\"\"`) → 400 VALIDATION_ERROR naming `text` — the min(1) lower bound", async () => {
    const { status, body } = await api("POST", "/v1/ai/parse", {
      token: parseUser.token,
      body: { text: "" },
    });
    assert.equal(status, 400, "an empty capture must be rejected, not sent to the model");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "text"),
      "an empty capture must name `text` (the min(1) bound fired)",
    );
  });

  test("AC3 · out-of-enum `locale` (e.g. `\"fr\"`) → 400 VALIDATION_ERROR naming `locale`", async () => {
    const { status, body } = await api("POST", "/v1/ai/parse", {
      token: parseUser.token,
      body: { text: "buy milk", locale: "fr" },
    });
    assert.equal(status, 400, "an unsupported locale must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "locale"),
      "the rejection must name `locale` (the enum bound fired, not an incidental 400)",
    );
  });

  test("AC4 · a valid `text` with no LLM configured → 200 graceful fallback (never a 5xx)", async () => {
    // The daily ephemeral harness has no AI provider, so a valid capture must
    // degrade to the deterministic no-LLM fallback rather than erroring.
    const { status, body } = await api("POST", "/v1/ai/parse", {
      token: parseUser.token,
      body: { text: "  Call the dentist  ", locale: "en" },
    });
    assert.equal(status, 200, "a valid capture must degrade gracefully, never a 5xx");
    assert.equal(body.quadrant, "unclassified", "no-LLM fallback leaves the task unclassified");
    assert.equal(body.title, "Call the dentist", "the fallback title echoes the trimmed input");
    assert.equal(body.confidence, 0, "the fallback carries zero confidence (no model ran)");
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
    const found = (list.body.items as Array<{ id: string; date: string }>).find((e) => e.id === created.id);
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
    const found = (list.body.items as Array<{ id: string; date: string }>).find((e) => e.id === created.id);
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

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY — AI-provider credential confidentiality on /v1/settings (#260)
//
// `PATCH /v1/settings` with `ai_configs_update.key` is the ONE place a user hands
// the backend a long-lived secret (their OpenAI/DeepSeek/Claude/custom API key).
// The confidentiality contract has two load-bearing halves:
//   (1) ENCRYPTED AT REST — the key is stored `enc:v1:`-encrypted (AES-256-GCM via
//       `encryptSecret`) in the `settings.ai_configs` JSON column, never plaintext,
//       so a DB / backup leak does not spill usable provider keys.
//   (2) NEVER ECHOED — `rowToSettings` projects each provider config down to
//       `{ hasKey, model, baseUrl }`; the key value (plaintext OR its `enc:v1:`
//       ciphertext) is returned by NEITHER `PATCH` NOR `GET /v1/settings`.
// Settings' only prior presence in this daily suite is the #264 reminder-time
// robustness cases; the secret-handling contract — the whole reason the column is
// JSON-with-an-encrypted-field rather than a plain value — had no real-HTTP +
// real-file-SQLite coverage. A regression that (a) dropped the `encryptSecret`
// wrap (stored the key in cleartext) or (b) surfaced the key in `rowToSettings`
// would ship silently: the per-PR in-process `api/settings.test.ts` asserts
// `hasKey` shape but not at-rest ciphertext or full-body non-echo. These cases
// pin both halves at the layer where a real DB file exists to inspect.
describe("DFX · Security — AI-provider credential confidentiality on /v1/settings (#260)", () => {
  // A distinctive sentinel so a substring scan of any response / column is
  // unambiguous — it cannot legitimately appear anywhere but as the raw secret.
  const SECRET = "sk-lumo-dfx-CONFIDENTIAL-SENTINEL-260-do-not-echo";
  let secretsUser: { token: string; id: string };

  before(async () => {
    secretsUser = await registerUser("settings-secrets-260");
  });

  async function storedAiConfigs(): Promise<Record<string, { key: string }>> {
    const row = await queryOne<{ ai_configs: string | null }>(
      "SELECT ai_configs FROM settings WHERE user_id = :uid",
      { uid: secretsUser.id },
    );
    return JSON.parse(row?.ai_configs ?? "{}");
  }

  test("a submitted provider key is stored `enc:v1:`-encrypted at rest, never as plaintext", async () => {
    const { status, body } = await api("PATCH", "/v1/settings", {
      token: secretsUser.token,
      body: { ai_configs_update: { provider: "custom", key: SECRET } },
    });
    assert.equal(status, 200, "a valid key update must be accepted");
    // The response acknowledges the key is set …
    assert.equal(body.ai_provider_configs?.custom?.hasKey, true, "hasKey must flip true once a key is stored");

    // … but the raw `settings.ai_configs` column must hold ONLY ciphertext.
    const configs = await storedAiConfigs();
    const stored = configs.custom?.key ?? "";
    assert.ok(stored.startsWith("enc:v1:"), `stored key must be enc:v1:-encrypted, got ${JSON.stringify(stored).slice(0, 40)}…`);
    assert.ok(!stored.includes(SECRET), "the plaintext secret must NOT appear in the at-rest column (AES-256-GCM → base64)");
  });

  test("the key is NEVER echoed — neither the plaintext nor its ciphertext appears in PATCH or GET responses", async () => {
    // Read back what is actually stored, so we can prove the API leaks NEITHER form.
    const configs = await storedAiConfigs();
    const ciphertext = configs.custom?.key ?? "";
    assert.ok(ciphertext.startsWith("enc:v1:"), "precondition: a key was stored encrypted by the prior case");

    // PATCH response body (re-fetch via a no-op-ish valid PATCH that returns settings).
    const patch = await api("PATCH", "/v1/settings", {
      token: secretsUser.token,
      body: { ai_provider: "custom" },
    });
    assert.equal(patch.status, 200);

    const get = await api("GET", "/v1/settings", { token: secretsUser.token });
    assert.equal(get.status, 200);

    for (const [label, res] of [["PATCH", patch], ["GET", get]] as const) {
      const serialized = JSON.stringify(res.body);
      assert.ok(!serialized.includes(SECRET), `${label} /v1/settings must never echo the plaintext key`);
      assert.ok(!serialized.includes(ciphertext), `${label} /v1/settings must never echo the stored ciphertext either`);
      // The projection exposes presence + non-secret display fields, never the key itself.
      const custom = res.body.ai_provider_configs?.custom;
      assert.equal(custom?.hasKey, true, `${label} must report hasKey:true`);
      assert.ok(!("key" in (custom ?? {})), `${label} provider config must not carry a \`key\` field at all`);
    }
  });

  test("an unrelated settings PATCH keeps the key encrypted at rest and un-echoed (conditional-write has teeth)", async () => {
    // The handler only (re)writes the key on `key != null && key.trim()`. A PATCH
    // that touches ONLY a non-secret field (here `model`) must leave the encrypted
    // key intact — not wipe it, not round-trip it back through cleartext.
    const before = (await storedAiConfigs()).custom?.key ?? "";
    assert.ok(before.startsWith("enc:v1:"), "precondition: key already stored encrypted");

    const { status, body } = await api("PATCH", "/v1/settings", {
      token: secretsUser.token,
      body: { ai_configs_update: { provider: "custom", model: "custom-model-260" } },
    });
    assert.equal(status, 200);
    assert.equal(body.ai_provider_configs?.custom?.model, "custom-model-260", "the non-secret field update must persist");
    assert.equal(body.ai_provider_configs?.custom?.hasKey, true, "the pre-existing key must still be reported present");

    const after = (await storedAiConfigs()).custom?.key ?? "";
    assert.ok(after.startsWith("enc:v1:"), "the key must remain enc:v1:-encrypted after the unrelated update");
    assert.ok(!after.includes(SECRET), "the unrelated update must not round-trip the key back to cleartext at rest");

    // And still no leak in the response body.
    assert.ok(!JSON.stringify(body).includes(SECRET), "the unrelated PATCH must not echo the plaintext key");
    assert.ok(!JSON.stringify(body).includes(after), "the unrelated PATCH must not echo the stored ciphertext");
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
// Design for ROBUSTNESS — habit frequency-scheduling fields are range-bounded (#444)
//
// Coverage-gap audit (recurrence/streak engine). `habits` is present in this daily
// suite only via tenant-isolation (#158), migrate id-collision (#276/#306), the
// log-IDOR sweep (#165), and the check-in `date` format bound (#267) — none of
// which touch the CREATE/UPDATE body's scheduling fields. `POST /v1/habits`
// (`HabitBody`) and `PATCH /v1/habits/:id` (`HabitUpdateBody`, its partial) gate the
// three inputs that DRIVE which days a habit fires and how its streak is computed:
//
//   • `frequencyDays`     — `z.array(z.number().int().min(0).max(6))`, the weekday
//                           indices for a `days_of_week` habit.
//   • `frequencyTimes`    — `z.number().int().min(1).max(7)`, the target count for a
//                           `times_per_week` habit.
//   • `frequencyInterval` — `z.number().int().min(2).max(30)`, the every-N-days step
//                           for an `interval` habit (floor is 2, NOT 1 — an
//                           `interval` of 1 is just `daily`, so 1 is the insidious
//                           plausible-but-wrong near-miss).
//
// These Zod bounds are the ONLY guard on the scheduling inputs — there is no
// downstream clamp — so a regression loosening any of them would persist a habit
// that never fires (bad weekday index) or miscomputes its cadence/streak, surfacing
// only in production past every existing daily case. Same class as the numeric
// range-bound audits (`focus.duration` [1,1440] #405) and the format-bound family
// (#176/#240/#264/#267). PATCH re-validates the partial body, so the bounds apply on
// BOTH write paths; round-trips read back via the owner's `GET /v1/habits` list
// (there is no GET /:id). Gives each bound teeth (a plausible-but-wrong value is
// rejected, the offending field is named), proves the inclusive boundaries are
// accepted (no off-by-one happy-path regression), and proves a rejected PATCH leaves
// the stored row unmutated (no partial poison). Handler/contract already correct →
// gap in the tests, not the code; test + docs only, no production change.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness — habit frequency-scheduling fields are range-bounded (#444)", () => {
  let hf: { token: string; id: string };

  before(async () => {
    hf = await registerUser("habit-frequency");
  });

  test("over-range `frequencyDays` element (7) on POST /v1/habits → 400 naming frequencyDays, no habit written", async () => {
    const before = await api("GET", "/v1/habits", { token: hf.token });
    const beforeCount = (before.body as { items: unknown[] }).items.length;

    const { status, body } = await api("POST", "/v1/habits", {
      token: hf.token,
      body: { title: "Gym", frequency: "days_of_week", frequencyDays: [1, 7] },
    });
    assert.equal(status, 400, "a weekday index of 7 must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) =>
        f.path.startsWith("frequencyDays"),
      ),
      "the rejection must name the offending `frequencyDays` element (the 0..6 element bound fired, not an incidental 400)",
    );

    // No poison: the rejected create must not have persisted a habit.
    const after = await api("GET", "/v1/habits", { token: hf.token });
    assert.equal((after.body as { items: unknown[] }).items.length, beforeCount, "a rejected create must not persist a habit row");
  });

  test("over-range `frequencyTimes` (8) → 400 naming frequencyTimes; server recovers", async () => {
    const { status, body } = await api("POST", "/v1/habits", {
      token: hf.token,
      body: { title: "Run", frequency: "times_per_week", frequencyTimes: 8 },
    });
    assert.equal(status, 400, "a weekly target above 7 must be rejected");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "frequencyTimes"),
      "the rejection must name `frequencyTimes` (the 1..7 range bound fired)",
    );

    // Recoverability: the next in-range request still succeeds.
    const ok = await api("POST", "/v1/habits", {
      token: hf.token,
      body: { title: "Run", frequency: "times_per_week", frequencyTimes: 3 },
    });
    assert.equal(ok.status, 201, "server survives the bad request; the next valid one works");
  });

  test("below-range `frequencyInterval` (1) → 400 naming frequencyInterval — the min(2) floor has teeth", async () => {
    // An interval of 1 day is just a `daily` habit, so the schema floors the
    // `interval` step at 2. `1` is the plausible-but-wrong near-miss that a
    // loosened bound (`min(1)` or `z.number()`) would silently accept.
    const { status, body } = await api("POST", "/v1/habits", {
      token: hf.token,
      body: { title: "Water plants", frequency: "interval", frequencyInterval: 1 },
    });
    assert.equal(status, 400, "an every-1-day interval must be rejected (that is just `daily`)");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "frequencyInterval"),
      "the rejection must name `frequencyInterval` (the 2..30 range bound fired)",
    );
  });

  test("valid habit at the inclusive boundaries (frequencyDays [0,6], frequencyTimes 7, frequencyInterval 30) round-trips via GET /v1/habits", async () => {
    // Each scheduling field at its extreme legal value in a single habit proves
    // the bounds are ceilings/floors, not off-by-one rejections.
    const { status, body } = await api("POST", "/v1/habits", {
      token: hf.token,
      body: {
        title: "Boundary habit",
        frequency: "days_of_week",
        frequencyDays: [0, 6],
        frequencyTimes: 7,
        frequencyInterval: 30,
      },
    });
    assert.equal(status, 201, "extreme-but-legal scheduling values must be accepted");
    assert.deepEqual(body.frequencyDays, [0, 6], "the create response must echo the stored weekday indices");
    assert.equal(body.frequencyInterval, 30, "the inclusive cap (30) must be accepted, not an off-by-one");

    // The scheduling inputs must survive storage and be readable back.
    const list = await api("GET", "/v1/habits", { token: hf.token });
    assert.equal(list.status, 200);
    const found = (list.body as { items: Array<{ id: string; frequencyDays?: number[]; frequencyTimes?: number; frequencyInterval?: number }> }).items
      .find((h) => h.id === body.id);
    assert.ok(found, "a subsequent read must reflect the persisted habit");
    assert.deepEqual(found?.frequencyDays, [0, 6], "weekday indices must round-trip intact");
    assert.equal(found?.frequencyTimes, 7, "the weekly target must round-trip intact");
    assert.equal(found?.frequencyInterval, 30, "the interval step must round-trip intact");
  });

  test("over-range PATCH `frequencyInterval` (99) → 400 and the stored habit is unmutated (no partial poison)", async () => {
    // Seed a valid interval habit, then attempt an out-of-range PATCH.
    const seed = await api("POST", "/v1/habits", {
      token: hf.token,
      body: { title: "Deep clean", frequency: "interval", frequencyInterval: 14 },
    });
    assert.equal(seed.status, 201);
    const id = seed.body.id;

    const { status, body } = await api("PATCH", `/v1/habits/${id}`, {
      token: hf.token,
      body: { frequencyInterval: 99 },
    });
    assert.equal(status, 400, "a PATCH above the 30-day cap must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "frequencyInterval"),
      "the PATCH rejection must name `frequencyInterval`",
    );

    // No poison: the rejected PATCH must leave the stored interval intact.
    const list = await api("GET", "/v1/habits", { token: hf.token });
    const found = (list.body as { items: Array<{ id: string; frequencyInterval?: number }> }).items.find((h) => h.id === id);
    assert.equal(found?.frequencyInterval, 14, "a rejected PATCH must leave the stored interval unmutated");
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
    const found = (list.body.items as Array<{ id: string; color: string; initials: string }>).find((p) => p.id === created.id);
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
    const found = (list.body.items as Array<{ id: string; color: string }>).find((p) => p.id === created.id);
    assert.equal(found?.color, good, "a rejected update must leave the stored color unchanged");
  });

  // #410 — the `:id` path param is bounded to [1,64] at the boundary, matching
  // every sibling CRUD resource. An oversized id is a clean 400 (never a DB
  // round-trip that resolves to 404), on BOTH write paths, and mutates nothing.
  test("over-length `:id` (> 64 chars) on PATCH → 400 VALIDATION_ERROR (not a 404 DB miss), stored row unmutated", async () => {
    const { body: created } = await createPerson(alice.token, { name: "Ivy", initials: "IV", color: "#123456" });
    const oversized = "z".repeat(65);
    const { status, body } = await api("PATCH", `/v1/people/${oversized}`, {
      token: alice.token,
      body: { name: "Renamed" },
    });
    assert.equal(status, 400, "an oversized :id must be rejected at the boundary, not resolve to a 404");
    assert.equal(body.error?.code, "VALIDATION_ERROR");

    const list = await api("GET", "/v1/people", { token: alice.token });
    const found = (list.body.items as Array<{ id: string; name: string }>).find((p) => p.id === created.id);
    assert.equal(found?.name, "Ivy", "the oversized-:id PATCH must not have touched any row");
  });

  test("over-length `:id` (> 64 chars) on DELETE → 400 VALIDATION_ERROR (not a 404), nothing tombstoned", async () => {
    const { body: created } = await createPerson(alice.token, { name: "Kai", initials: "KA", color: "#654321" });
    const oversized = "z".repeat(65);
    const { status, body } = await api("DELETE", `/v1/people/${oversized}`, { token: alice.token });
    assert.equal(status, 400, "an oversized :id must be rejected at the boundary, not resolve to a 404");
    assert.equal(body.error?.code, "VALIDATION_ERROR");

    const list = await api("GET", "/v1/people", { token: alice.token });
    assert.ok(
      (list.body.items as Array<{ id: string }>).some((p) => p.id === created.id),
      "an invalid DELETE must not tombstone any row",
    );
  });
});

// ── Design for RELIABILITY — person-delete → tasks.assignee_ids cascade (#263) ──
//
// `DELETE /v1/people/:id` (routes/people.ts) is the app's ONLY cross-resource
// cascade: after tombstoning the person it rewrites `tasks.assignee_ids`,
// dropping the deleted id from every referencing task via json_each, scoped
// `WHERE user_id = :uid AND EXISTS(SELECT 1 FROM json_each(assignee_ids) WHERE value = :pid)`.
// The daily suite reached `/v1/people` only via #158 (tenant isolation) + #279
// (avatar bounds) — those pin the person ROW, nothing pins the cascade. A
// regression that neutered the cascade would leave dangling assignee ids; one
// that dropped the `EXISTS(... = :pid)` predicate would rewrite EVERY task in
// the tenant (write amplification) — both invisible to every existing case.
describe("DFX · Reliability — person-delete cascades into tasks.assignee_ids (#263)", () => {
  let owner: { token: string; id: string };

  function createPerson(name: string, initials: string): Promise<string> {
    return api("POST", "/v1/people", {
      token: owner.token,
      body: { name, initials, color: "#3366cc" },
    }).then(({ status, body }) => {
      assert.equal(status, 201, `create person ${name} should 201`);
      return body.id as string;
    });
  }

  function createTask(titleEn: string, assigneeIds: string[]): Promise<string> {
    return api("POST", "/v1/tasks", {
      token: owner.token,
      body: { title: { en: titleEn }, quadrant: "Q2", assignee_ids: assigneeIds },
    }).then(({ status, body }) => {
      assert.equal(status, 201, `create task "${titleEn}" should 201`);
      assert.deepEqual(body.assignee_ids, assigneeIds, "the create response must echo the assignees");
      return body.id as string;
    });
  }

  // No GET /:id on tasks — read the row back out of the owner's list.
  async function getTask(id: string): Promise<{ assignee_ids: string[]; updated_at: string }> {
    const { status, body } = await api("GET", "/v1/tasks", { token: owner.token });
    assert.equal(status, 200);
    const found = (body.items as Array<{ id: string; assignee_ids: string[]; updated_at: string }>).find((t) => t.id === id);
    assert.ok(found, `task ${id} must appear in the owner's list`);
    return found!;
  }

  before(async () => {
    owner = await registerUser("people-cascade-owner");
  });

  test("AC1 — deleting a person drops its id from referencing tasks, keeps co-assignees, leaves non-referencing tasks whole", async () => {
    const [pTarget, pKeep] = await Promise.all([createPerson("Target", "TG"), createPerson("Keep", "KP")]);
    // T1 references BOTH (the removed one + a co-assignee); T2 references only the co-assignee.
    const t1 = await createTask("cascade-both", [pTarget, pKeep]);
    const t2 = await createTask("cascade-neither", [pKeep]);

    const del = await api("DELETE", `/v1/people/${pTarget}`, { token: owner.token });
    assert.equal(del.status, 204, "deleting an owned person returns 204");

    const after1 = await getTask(t1);
    assert.deepEqual(after1.assignee_ids, [pKeep], "the deleted id is dropped but the co-assignee is retained — partial removal, not a blanket clear");

    const after2 = await getTask(t2);
    assert.deepEqual(after2.assignee_ids, [pKeep], "a task that never referenced the deleted person is untouched");
  });

  test("AC2 — the cascade is precise: only referencing tasks are rewritten (no tenant-wide write amplification)", async () => {
    const pTarget = await createPerson("Amp", "AM");
    const referencing = await createTask("amp-referencing", [pTarget]);
    const unrelated = await createTask("amp-unrelated", []);

    const beforeRef = (await getTask(referencing)).updated_at;
    const beforeUnrel = (await getTask(unrelated)).updated_at;

    const del = await api("DELETE", `/v1/people/${pTarget}`, { token: owner.token });
    assert.equal(del.status, 204);

    const afterRef = (await getTask(referencing)).updated_at;
    const afterUnrel = (await getTask(unrelated)).updated_at;

    // The referencing task's LWW clock must advance (it was rewritten)…
    assert.ok(afterRef > beforeRef, "the referencing task's updated_at must advance (it was rewritten by the cascade)");
    // …but an unrelated task must be byte-for-byte untouched — proves the
    // `EXISTS(... = :pid)` predicate scoped the write. Dropping it would bump
    // every task in the tenant and redden exactly this line.
    assert.equal(afterUnrel, beforeUnrel, "an unrelated task's updated_at must be unchanged — the EXISTS predicate scopes the write");
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

// ───────────────────────────────────────────────────────────────────────────────
// Scalability gap: the two blocks above only exercise /v1/tasks (over-max → 400)
// and /v1/completed (over-max → clamped). But `people` (DEFAULT 200 / MAX 500),
// `projects` (DEFAULT 100 / MAX 500) and `countdowns` (DEFAULT 200 / MAX 500, #439)
// are ALSO keyset-paginated { items, nextCursor } via the shared cursor lib, and —
// like completed, unlike tasks — they CLAMP an over-max `limit` (Math.min) rather
// than rejecting it. Each had zero daily-suite
// scalability presence, so a regression that flipped their over-max contract to a
// tasks-style 400, or broke their cursor/envelope, would slip past the tasks-only
// + completed-only cases. These lock in the { items, nextCursor } envelope, the
// 200-not-400 over-max *status* contract, cursor-walk completeness, and bad-cursor
// rejection over real HTTP + real SQLite. (The clamp *value* itself is only fully
// exercisable with > MAX_LIMIT rows — disproportionately heavy for a per-run
// integration seed — so, like the /v1/completed sibling, the clamp's numeric
// ceiling is pinned by the shared cursor lib's unit tests, not re-seeded here.)
// Handlers already correct → gap in the tests, not the code (test + docs only).
// ───────────────────────────────────────────────────────────────────────────────

const PAGINATED_LIST_RESOURCES: Array<{
  name: string;
  path: string;
  defaultLimit: number;
  create: (i: number) => Record<string, unknown>;
}> = [
  {
    name: "people",
    path: "/v1/people",
    defaultLimit: 200,
    create: (i) => ({ name: `Person ${String(i).padStart(3, "0")}`, initials: "PP", color: "#5bc8d4" }),
  },
  {
    name: "projects",
    path: "/v1/projects",
    defaultLimit: 100,
    create: (i) => ({ name: `Project ${String(i).padStart(3, "0")}`, color: "cyan" }),
  },
  {
    // #439 — countdowns joined the keyset family (DEFAULT 200 / MAX 500, clamps).
    name: "countdowns",
    path: "/v1/countdowns",
    defaultLimit: 200,
    create: (i) => ({ title: `Countdown ${String(i).padStart(3, "0")}`, date: "2026-12-01", color: "green", repeat: "none" }),
  },
];

for (const resource of PAGINATED_LIST_RESOURCES) {
  describe(`DFX · Scalability — ${resource.name} list pagination is bounded & walk-complete`, () => {
    let user: { token: string; id: string };
    const TOTAL = 6; // > the small explicit limits below so paging is genuinely exercised

    before(async () => {
      user = await registerUser(`${resource.name}-scaler`);
      for (let i = 0; i < TOTAL; i++) {
        const { status } = await api("POST", resource.path, { token: user.token, body: resource.create(i) });
        assert.equal(status, 201, `seed ${resource.name} ${i} should create`);
      }
    });

    test("a no-limit list is the bounded { items, nextCursor } envelope (default page)", async () => {
      const { status, body } = await api("GET", resource.path, { token: user.token });
      assert.equal(status, 200);
      assert.ok(Array.isArray(body.items), "response must be an { items, nextCursor } envelope");
      // TOTAL < default page size, so everything fits on one page here.
      assert.ok(
        body.items.length <= resource.defaultLimit,
        `default page must be ≤ ${resource.defaultLimit}, got ${body.items.length}`,
      );
      assert.equal(body.items.length, TOTAL, "all seeded rows fit in the single default page here");
      assert.equal(body.nextCursor, null, "no further page when everything fits on the default page");
    });

    test("an explicit limit bounds the page and yields a nextCursor when more rows remain", async () => {
      const { status, body } = await api("GET", `${resource.path}?limit=2`, { token: user.token });
      assert.equal(status, 200);
      assert.ok(Array.isArray(body.items), "response must be an { items, nextCursor } envelope");
      assert.equal(body.items.length, 2, "page must be bounded to the requested limit");
      assert.ok(body.nextCursor, "more than one page of data → nextCursor must be present");
    });

    test("an over-max limit is CLAMPED (≤ 500), not rejected with 400 — like completed, unlike tasks", async () => {
      const { status, body } = await api("GET", `${resource.path}?limit=99999`, { token: user.token });
      assert.equal(status, 200, `${resource.name} clamps an over-max limit; it must not 400 like /v1/tasks`);
      assert.ok(Array.isArray(body.items), "response must still be the { items, nextCursor } envelope");
      assert.ok(body.items.length <= 500, `page must stay bounded by MAX_LIMIT (500), got ${body.items.length}`);
      // With only TOTAL (< 500) rows the clamped single page holds them all.
      assert.equal(body.items.length, TOTAL, "all rows fit in one clamped page here");
      assert.equal(body.nextCursor, null, "no further page when everything fits in one clamped page");
    });

    test("cursor paging walks every row exactly once — no dupes, no omissions", async () => {
      const seen = new Set<string>();
      let cursor: string | null = null;
      let pages = 0;
      do {
        const url: string = cursor
          ? `${resource.path}?limit=2&cursor=${encodeURIComponent(cursor)}`
          : `${resource.path}?limit=2`;
        const { status, body } = await api("GET", url, { token: user.token });
        assert.equal(status, 200);
        for (const item of body.items) {
          assert.ok(!seen.has(item.id), `${resource.name} ${item.id} returned on more than one page`);
          seen.add(item.id);
        }
        cursor = body.nextCursor;
        pages++;
        assert.ok(pages <= 10, "pagination did not terminate — possible cursor loop");
      } while (cursor);
      assert.equal(seen.size, TOTAL, `expected ${TOTAL} unique ${resource.name} across pages, got ${seen.size}`);
    });

    test("an unparseable cursor is rejected → 400 INVALID_CURSOR (no unbounded fallback read)", async () => {
      const { status } = await api("GET", `${resource.path}?cursor=not-a-real-cursor`, { token: user.token });
      assert.equal(status, 400, "a garbage cursor must be rejected, not silently ignored");
    });
  });
}

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

// ═══════════════════════════════════════════════════════════════════════════════
// Design for ROBUSTNESS — /v1/ai/chat request-payload bounds (#320)
// ═══════════════════════════════════════════════════════════════════════════════
//
// `/v1/ai/chat` is the app's highest-volume LLM entry point (pet PetChat). There
// is no body-size middleware, so the `ChatBody` Zod caps — `messages` array ≤ 20,
// each message `content` ≤ 5000 chars — are the *sole* guard against unbounded
// LLM-prompt payload growth (a cost / prompt-injection-surface / memory
// amplification vector). A regression loosening either cap, or returning a 5xx on
// an oversized body instead of a clean 400, would slip past every other DFX case
// and surface only as inflated LLM cost/latency in prod. `validate("json", …)`
// runs as middleware *before* the handler, so every rejection is testable with no
// AI provider configured; the valid case takes the deterministic no-key fallback
// (`tryParseIntent` → null → `fallbackReply`) → 200 `fallback:true`.
describe("DFX · Robustness — /v1/ai/chat request-payload bounds (#320)", () => {
  let chatter: { token: string; id: string };
  before(async () => {
    chatter = await registerUser("ai-chat-bounds");
  });

  test("over-cap `messages` array (> 20) → 400 VALIDATION_ERROR naming `messages`; not a 5xx", async () => {
    const messages = Array.from({ length: 21 }, () => ({ role: "user", content: "hi" }));
    const { status, body } = await api("POST", "/v1/ai/chat", {
      token: chatter.token,
      body: { messages },
    });
    assert.equal(status, 400, "an over-cap messages array must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "messages"),
      "the rejection must name `messages` (the array-length cap fired, not an incidental 400)",
    );
  });

  test("over-length `content` (> 5000 chars) in a message → 400 naming `messages.0.content`", async () => {
    const { status, body } = await api("POST", "/v1/ai/chat", {
      token: chatter.token,
      body: { messages: [{ role: "user", content: "x".repeat(5001) }] },
    });
    assert.equal(status, 400, "an over-length message content must be rejected (no unbounded prompt write)");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "messages.0.content"),
      "the rejection must name the offending message field (`messages.0.content`) — the per-message length cap fired",
    );

    // Recoverability: the oversized body must not poison the server — a normal
    // chat still succeeds afterwards, proving no crash / no unbounded read.
    const ok = await api("POST", "/v1/ai/chat", {
      token: chatter.token,
      body: { messages: [{ role: "user", content: "Hi! How are you feeling today?" }] },
    });
    assert.equal(ok.status, 200, "server stays healthy after rejecting an over-length message");
  });

  test("a valid small chat body (no AI provider) → 200 `fallback:true` — caps are not over-restrictive", async () => {
    const { status, body } = await api("POST", "/v1/ai/chat", {
      token: chatter.token,
      body: { messages: [{ role: "user", content: "Hi! How are you feeling today?" }] },
    });
    assert.equal(status, 200, "a valid within-caps chat body must be accepted");
    assert.equal(body.fallback, true, "with no AI provider the no-key fallback path must serve a canned reply");
    assert.equal(typeof body.reply, "string");
    assert.ok(body.reply.length > 0, "the fallback reply must be non-empty");
  });

  test("payload exactly at both caps (20 messages, 5000-char content) is accepted → the caps sit at 20/5000, not below", async () => {
    // Mutation teeth: a tightening regression (e.g. `.max(19)` or `content.max(4999)`)
    // would flip this at-boundary body from 200 to 400.
    const messages = Array.from({ length: 19 }, () => ({ role: "user", content: "warm-up" }));
    messages.push({ role: "user", content: "y".repeat(5000) });
    const { status, body } = await api("POST", "/v1/ai/chat", {
      token: chatter.token,
      body: { messages },
    });
    assert.equal(status, 200, "a body exactly at the caps (20 msgs / 5000 chars) must still be accepted");
    assert.equal(body.fallback, true, "the at-boundary body still takes the no-key fallback path");
  });

  // #172 V2 — calendar-aware planning threads `context.calendarBusyHours` (hours
  // booked in the client's imported calendar) into generate_today_plan. It is
  // bounded `z.number().nonnegative().max(24)` so a malformed client value can't
  // distort the plan's time budget; these pin that bound.
  test("out-of-range `context.calendarBusyHours` → 400 naming the field; in-range → 200", async () => {
    for (const bad of [-1, 25]) {
      const { status, body } = await api("POST", "/v1/ai/chat", {
        token: chatter.token,
        body: { messages: [{ role: "user", content: "plan my day" }], context: { calendarBusyHours: bad } },
      });
      assert.equal(status, 400, `calendarBusyHours=${bad} must be rejected (outside [0,24])`);
      assert.equal(body.error?.code, "VALIDATION_ERROR");
      assert.ok(
        (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "context.calendarBusyHours"),
        "the rejection must name context.calendarBusyHours",
      );
    }
    // A valid in-range value is accepted (no AI provider → fallback path).
    const ok = await api("POST", "/v1/ai/chat", {
      token: chatter.token,
      body: { messages: [{ role: "user", content: "plan my day" }], context: { calendarBusyHours: 3 } },
    });
    assert.equal(ok.status, 200, "an in-range calendarBusyHours (3) must be accepted");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for ROBUSTNESS — /v1/ai/chat context.todayTasks / recentCompleted bounds (#380)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Sibling to #320 (which pinned the `messages` array / per-message `content` caps on
// the same endpoint). `ChatBody.context` also carries the two largest *client-supplied*
// nested payloads injected into the LLM prompt — `todayTasks` (array `.max(50)`, each
// `title.max(500)` / `quadrant.max(20)`; up to 50×500 chars of task titles) and
// `recentCompleted` (array `.max(20)`, each `title.max(500)`). There is no body-size
// middleware, so these Zod caps are the *sole* bound on how much task data floods the
// prompt (cost / prompt-injection-surface / memory amplification). A regression loosening
// any cap, or a 5xx on an oversized body instead of a clean 400, slips past every other
// DFX case and surfaces only as inflated LLM cost in prod. `validate("json", ChatBody)`
// runs before the handler, so both the 400 (bad input) and 200 (valid → no-key
// `fallback:true`) paths are verifiable with no AI provider configured.
describe("DFX · Robustness — /v1/ai/chat context.todayTasks / recentCompleted bounds (#380)", () => {
  let chatter: { token: string; id: string };
  before(async () => {
    chatter = await registerUser("ai-chat-ctx-bounds");
  });

  test("over-cap `context.todayTasks` array (> 50) → 400 VALIDATION_ERROR naming `context.todayTasks`; not a 5xx", async () => {
    const todayTasks = Array.from({ length: 51 }, (_, i) => ({ id: `t${i}`, title: "task", quadrant: "q1" }));
    const { status, body } = await api("POST", "/v1/ai/chat", {
      token: chatter.token,
      body: { messages: [{ role: "user", content: "plan my day" }], context: { todayTasks } },
    });
    assert.equal(status, 400, "an over-cap todayTasks array must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "context.todayTasks"),
      "the rejection must name `context.todayTasks` (the array-length cap fired, not an incidental 400)",
    );
  });

  test("over-length `context.todayTasks.0.title` (> 500 chars) → 400 naming the dotted path; server stays healthy", async () => {
    const { status, body } = await api("POST", "/v1/ai/chat", {
      token: chatter.token,
      body: {
        messages: [{ role: "user", content: "plan my day" }],
        context: { todayTasks: [{ id: "t0", title: "x".repeat(501), quadrant: "q1" }] },
      },
    });
    assert.equal(status, 400, "an over-length task title must be rejected (no unbounded prompt write)");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "context.todayTasks.0.title"),
      "the rejection must name `context.todayTasks.0.title` — the per-title length cap fired inside the array element",
    );

    // Recoverability: the oversized body must not poison the server — a normal chat
    // still succeeds afterwards, proving no crash / no unbounded read.
    const ok = await api("POST", "/v1/ai/chat", {
      token: chatter.token,
      body: { messages: [{ role: "user", content: "Hi!" }] },
    });
    assert.equal(ok.status, 200, "server stays healthy after rejecting an over-length task title");
  });

  test("over-cap `context.recentCompleted` array (> 20) → 400 naming `context.recentCompleted`", async () => {
    const recentCompleted = Array.from({ length: 21 }, () => ({ title: "done", completedAt: "2026-07-07T09:00" }));
    const { status, body } = await api("POST", "/v1/ai/chat", {
      token: chatter.token,
      body: { messages: [{ role: "user", content: "how did I do" }], context: { recentCompleted } },
    });
    assert.equal(status, 400, "an over-cap recentCompleted array must be a client error, not 5xx");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "context.recentCompleted"),
      "the rejection must name `context.recentCompleted` (the array-length cap fired)",
    );
  });

  test("context exactly at both caps (50 todayTasks / 20 recentCompleted, all valid) is accepted → the caps sit at 50/20, not below", async () => {
    // Mutation teeth: a tightening regression (e.g. todayTasks `.max(49)` or
    // recentCompleted `.max(19)`) would flip this at-boundary body from 200 to 400.
    const todayTasks = Array.from({ length: 50 }, (_, i) => ({ id: `t${i}`, title: "task", quadrant: "q1" }));
    const recentCompleted = Array.from({ length: 20 }, () => ({ title: "done", completedAt: "2026-07-07T09:00" }));
    const { status, body } = await api("POST", "/v1/ai/chat", {
      token: chatter.token,
      body: { messages: [{ role: "user", content: "plan my day" }], context: { todayTasks, recentCompleted } },
    });
    assert.equal(status, 200, "a context exactly at the caps (50 / 20) must still be accepted");
    assert.equal(body.fallback, true, "the at-boundary body still takes the no-key fallback path");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY — auth/refresh rotation, single-use & reuse-detection (#284)
//
// `POST /v1/auth/refresh` (routes/auth.ts:175) exchanges a long-lived refresh
// token for a fresh access token, ROTATING the refresh token on every use
// (rotateRefreshToken, lib/refreshToken.ts:80). Its security invariants are the
// backbone of "stay logged in without a 7-day bearer token":
//   • single-use rotation — the presented token is revoked, a new one issued;
//   • theft response — replaying an already-revoked token revokes the WHOLE
//     family (revokeAllForUser), so a stolen-and-replayed token also kills the
//     legitimate client;
//   • revocation on sign-out — a refresh token handed to /signout is dead;
//   • session-version invalidation — a password change bumps session_version and
//     strands outstanding refresh tokens.
// These are only exercised in-process (api/auth-refresh.test.ts via app.request());
// the daily suite — real fetch() over TCP against a real *file* SQLite, the layer
// that has caught file-DB-only bugs the in-memory tests missed — had no coverage
// of the refresh lifecycle at all. Dedicated actors per test isolate token
// families (a family-revoke in one test must not bleed into another).
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Security — auth/refresh rotation, single-use & reuse-detection (#284)", () => {
  test("AC1 · rotation & single-use — valid refresh → 200 with a working new access token + a rotated refresh token; the old token is now dead", async () => {
    await registerUser("refresh-rotate"); // create the account; signin below yields a known token pair
    const { status: sIn, body: creds } = await api("POST", "/v1/auth/signin", {
      body: { username: uniqueUsername("refresh-rotate"), password: "Secret1234!" },
    });
    assert.equal(sIn, 200, "signin should return a fresh token pair");
    const rt1: string = creds.refreshToken;
    assert.equal(typeof rt1, "string");
    assert.ok(rt1.length > 0, "signin must return a non-empty refresh token");

    const { status, body } = await api("POST", "/v1/auth/refresh", { body: { refreshToken: rt1 } });
    assert.equal(status, 200, "a valid refresh token must be exchanged, not rejected");
    assert.ok(body.token, "refresh must return a new access token");
    assert.ok(body.refreshToken, "refresh must return a rotated refresh token");
    assert.notEqual(body.refreshToken, rt1, "the refresh token MUST rotate (single-use) — a stable token defeats reuse-detection");

    // The freshly minted access token authenticates a protected route.
    const protectedRes = await api("GET", "/v1/tasks", { token: body.token });
    assert.equal(protectedRes.status, 200, "the refreshed access token must be accepted on a protected route");

    // Single-use: replaying the now-rotated rt1 is refused.
    const replay = await api("POST", "/v1/auth/refresh", { body: { refreshToken: rt1 } });
    assert.equal(replay.status, 401, "the presented (now-rotated) refresh token must be single-use → 401");
  });

  test("AC2 · theft response — replaying a rotated token revokes the WHOLE family (the successor token dies too)", async () => {
    // This is the load-bearing security case: it is the ONLY thing that pins the
    // revokeAllForUser(row.user_id) branch. Deleting that line still 401s the
    // replayed rt1 (it is revoked), but the successor rt2 would stay live → this
    // test's final assertion is what reddens on that mutation (perfect specificity).
    await registerUser("refresh-theft");
    const { body: creds } = await api("POST", "/v1/auth/signin", {
      body: { username: uniqueUsername("refresh-theft"), password: "Secret1234!" },
    });
    const rt1: string = creds.refreshToken;

    const { status: rotStatus, body: rotated } = await api("POST", "/v1/auth/refresh", { body: { refreshToken: rt1 } });
    assert.equal(rotStatus, 200);
    const rt2: string = rotated.refreshToken; // legitimate successor

    // Attacker replays the captured, already-rotated rt1 → reuse detected → 401.
    const reuse = await api("POST", "/v1/auth/refresh", { body: { refreshToken: rt1 } });
    assert.equal(reuse.status, 401, "a replayed (already-rotated) refresh token must be rejected");
    assert.equal(reuse.body?.error?.code, "INVALID_REFRESH_TOKEN", "reuse must surface the auth error code, not a 5xx");

    // Theft response: the reuse revoked the entire family, so the otherwise-valid
    // successor rt2 is now dead too — the legitimate client is forced to re-auth.
    const successor = await api("POST", "/v1/auth/refresh", { body: { refreshToken: rt2 } });
    assert.equal(successor.status, 401, "reuse-detection must revoke the whole token family — the successor token must also die");
  });

  test("AC3 · robustness — unknown token → 401 (never 5xx), missing field → 400; the server recovers", async () => {
    const garbage = await api("POST", "/v1/auth/refresh", { body: { refreshToken: "not-a-real-token" } });
    assert.equal(garbage.status, 401, "an unknown refresh token is a clean 401, never a 5xx crash");
    assert.equal(garbage.body?.error?.code, "INVALID_REFRESH_TOKEN");

    const missing = await api("POST", "/v1/auth/refresh", { body: {} });
    assert.equal(missing.status, 400, "a missing refreshToken field is a 400 validation error");
    assert.equal(missing.body?.error?.code, "VALIDATION_ERROR");

    // Recoverability: the malformed requests must not poison the server — a real
    // token still refreshes afterward.
    await registerUser("refresh-recover");
    const { body: creds } = await api("POST", "/v1/auth/signin", {
      body: { username: uniqueUsername("refresh-recover"), password: "Secret1234!" },
    });
    const ok = await api("POST", "/v1/auth/refresh", { body: { refreshToken: creds.refreshToken } });
    assert.equal(ok.status, 200, "the server stays healthy after rejecting malformed refresh requests");
  });

  test("AC4 · revocation on sign-out — a refresh token sent to /signout can no longer refresh", async () => {
    await registerUser("refresh-signout");
    const { body: creds } = await api("POST", "/v1/auth/signin", {
      body: { username: uniqueUsername("refresh-signout"), password: "Secret1234!" },
    });
    const rt: string = creds.refreshToken;

    const out = await api("POST", "/v1/auth/signout", { token: creds.token, body: { refreshToken: rt } });
    assert.equal(out.status, 200, "signout with a refresh token in the body should succeed");

    const after = await api("POST", "/v1/auth/refresh", { body: { refreshToken: rt } });
    assert.equal(after.status, 401, "a refresh token revoked at sign-out must no longer mint access tokens");
  });

  test("AC5 · session-version invalidation — a password change strands outstanding refresh tokens", async () => {
    // Pins the `row.session_version < user.session_version` guard: a password
    // change bumps session_version, so a refresh token issued before it is stale.
    await registerUser("refresh-pwchange");
    const { body: creds } = await api("POST", "/v1/auth/signin", {
      body: { username: uniqueUsername("refresh-pwchange"), password: "Secret1234!" },
    });
    const staleRt: string = creds.refreshToken;

    const chg = await api("POST", "/v1/auth/change-password", {
      token: creds.token,
      body: { current_password: "Secret1234!", new_password: "Secret5678!" },
    });
    assert.equal(chg.status, 200, "password change should succeed");

    const after = await api("POST", "/v1/auth/refresh", { body: { refreshToken: staleRt } });
    assert.equal(after.status, 401, "a password change must invalidate refresh tokens issued before it (session_version bump)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for ROBUSTNESS — auth register/signin input bounds (#387)
// ═══════════════════════════════════════════════════════════════════════════════
// `POST /v1/auth/register` and `POST /v1/auth/signin` are the app's TWO public,
// unauthenticated, highest-traffic endpoints, yet the daily suite exercised them
// only as the `registerUser` fixture helper. Auth is now USERNAME-first
// (commit 1945fba): `register`/`signin` take `{ username, password }` — there is
// no `email` or `name` at the auth boundary anymore (email is bound later via
// `POST /v1/auth/bind-email`; `name` defaults to the username).
//
// Each body is gated by a Zod schema (`RegisterBody` / `SigninBody`, routes/auth.ts)
// that runs via `validate("json", …)` BEFORE the handler touches the users table
// or spends any bcrypt time. `register.username` is
// `z.string().min(3).max(32).regex([A-Za-z0-9_-])`, may not start/end with a
// separator, and rejects a reserved-word blacklist (admin|root|lumo|support|system)
// — all surfaced as VALIDATION_ERROR. `signin.username` is `z.string().min(1).max(32)`.
// These caps are the only barrier stopping a malformed/oversized/reserved username
// from reaching storage; a regression loosening any of them would surface only as
// corrupt data / a 5xx in prod, past every existing case.
//
// NOTE — this pins the pre-auth VALIDATION layer only (malformed shape → 400),
// which is orthogonal to the signin account-enumeration/timing policy (the
// deliberately-uniform 401 for a VALID-but-unknown username): a malformed username
// is rejected at the shape gate before the credential path ever runs, so it is a
// clean 400, never the 401 that enumeration concerns are about.
describe("DFX · Robustness — auth register/signin input bounds (#387)", () => {
  test("AC1 · register with a malformed `username` (bad chars) → 400 VALIDATION_ERROR naming `username`; a valid register still 201 (recoverability)", async () => {
    const bad = await api("POST", "/v1/auth/register", {
      body: { username: "bad name!", password: "Secret1234!" },
    });
    assert.equal(bad.status, 400, "a bad-charset username must be a client error, not a 5xx or a stored row");
    assert.equal(bad.body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (bad.body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "username"),
      "the rejection must name `username` (the charset regex fired, not an incidental 400)",
    );

    // Too short: below the min(3) lower bound → also 400 naming `username`.
    const tooShort = await api("POST", "/v1/auth/register", {
      body: { username: "ab", password: "Secret1234!" },
    });
    assert.equal(tooShort.status, 400, "a 2-char username is below min(3) and must be rejected");
    assert.ok(
      (tooShort.body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "username"),
      "the too-short rejection must name `username`",
    );

    // Reserved word → 400 naming `username` (the blacklist refinement fired).
    const reserved = await api("POST", "/v1/auth/register", {
      body: { username: "admin", password: "Secret1234!" },
    });
    assert.equal(reserved.status, 400, "a reserved username must be rejected, not claimable");
    assert.ok(
      (reserved.body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "username"),
      "the reserved-word rejection must name `username`",
    );

    // Recoverability + proof it was the username shape (not a dead endpoint): a
    // well-formed registration right after still succeeds → 201 with a token.
    const good = await api("POST", "/v1/auth/register", {
      body: { username: uniqueUsername("authbounds-ok"), password: "Secret1234!" },
    });
    assert.equal(good.status, 201, "a well-formed register after a rejected one must still succeed");
    assert.ok(typeof good.body.token === "string" && good.body.token.length > 0, "a successful register returns a token");
  });

  test("AC2 · register with an over-length `username` (> 32) → 400 VALIDATION_ERROR naming `username`", async () => {
    const { status, body } = await api("POST", "/v1/auth/register", {
      body: { username: "u".repeat(33), password: "Secret1234!" },
    });
    assert.equal(status, 400, "an over-length username must be rejected, not stored");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "username"),
      "the rejection must name `username` (the max(32) bound fired)",
    );
  });

  test("AC3 · signin with a missing `username` → 400 VALIDATION_ERROR naming `username`", async () => {
    const { status, body } = await api("POST", "/v1/auth/signin", {
      body: { password: "whatever" },
    });
    assert.equal(status, 400, "a missing signin username is a validation error (400), never the credential-path 401");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "username"),
      "the rejection must name `username` (signin's own min(1) bound fired)",
    );
  });

  test("AC4 · signin with a blank `username` (`\"\"`) → 400 VALIDATION_ERROR naming `username` (validation before the credential/enumeration path, not a 401)", async () => {
    const { status, body } = await api("POST", "/v1/auth/signin", {
      body: { username: "", password: "whatever" },
    });
    // 400 (shape gate), NOT 401: the blank username is rejected before the
    // no-user credential path runs, so this is orthogonal to the uniform-401
    // enumeration policy for valid-but-unknown usernames.
    assert.equal(status, 400, "a blank signin username is a validation error (400), never the credential-path 401");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "username"),
      "the rejection must name `username` (signin's own min(1) bound fired)",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY — change-password: a FAILED attempt has no side effects (#419)
// ═══════════════════════════════════════════════════════════════════════════════
// `POST /v1/auth/change-password` is a security-sensitive, authenticated endpoint:
// it verifies the caller's CURRENT password, re-hashes the new one, and bumps
// `session_version` so every previously-issued token is stranded (full session
// rotation on success). Yet this daily suite (real HTTP + real file SQLite) has NO
// dedicated block for it — its only appearance is the happy-path 200 inside the
// refresh AC5 case (which pins the refresh-side CONSUMPTION of the bump, not the
// endpoint's own contract). The in-process `api/auth.test.ts` covers the status
// codes in-memory, but PR CI never runs the daily suite AND — more importantly —
// no test anywhere pins the load-bearing property that a FAILED attempt (wrong
// `current_password`) leaves BOTH the stored password AND `session_version`
// untouched. A regression that bumped `session_version` before / regardless of the
// password check would let anyone holding a STOLEN access token strand the victim's
// other sessions (a self-inflicted DoS on the legit user); one that skipped the
// check would silently accept the change. Neither is caught by any existing case.
//
// Verified black-box (no DB reads): session_version un-bumped ⇔ a token minted
// before the failed attempt still authenticates a protected route; password
// unchanged ⇔ the old password still signs in.
describe("DFX · Security — change-password failed attempt has no side effects (#419)", () => {
  // Dedicated actors (this endpoint mutates the account's password + session
  // version, so it must never reuse the shared alice/bob fixtures).

  test("AC1 · authN + input bounds: no token → 401; weak new_password → 400 naming `new_password`; server recovers", async () => {
    const noTok = await api("POST", "/v1/auth/change-password", {
      body: { current_password: "Secret1234!", new_password: "Secret5678!" },
    });
    assert.equal(noTok.status, 401, "change-password without a token must be 401, never a 5xx");
    assert.equal(noTok.body.error?.code, "UNAUTHORIZED");

    const { token } = await registerUser("cp-bounds");

    const weak = await api("POST", "/v1/auth/change-password", {
      token,
      body: { current_password: "Secret1234!", new_password: "short" },
    });
    assert.equal(weak.status, 400, "a weak new password must be rejected at the validation boundary, not stored");
    assert.equal(weak.body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      (weak.body.error?.fields as Array<{ path: string }> | undefined)?.some((f) => f.path === "new_password"),
      "the rejection must name `new_password` (the strength bound fired, not an incidental 400)",
    );

    // Recoverability: the endpoint is unharmed — a subsequent VALID change still 200s.
    const ok = await api("POST", "/v1/auth/change-password", {
      token,
      body: { current_password: "Secret1234!", new_password: "Secret5678!" },
    });
    assert.equal(ok.status, 200, "the endpoint must still succeed after rejecting a weak-password request (not wedged)");
  });

  test("AC2 · a WRONG current_password is a no-op: 400 WRONG_PASSWORD, password unchanged, session_version un-bumped", async () => {
    const username = uniqueUsername("cp-wrong");
    const { token } = await registerUser("cp-wrong");

    // A token minted BEFORE the failed attempt — used to prove session_version is
    // not bumped by a failure.
    const { body: pre } = await api("POST", "/v1/auth/signin", { body: { username, password: "Secret1234!" } });
    const preToken: string = pre.token;
    const preOk = await api("GET", "/v1/user", { token: preToken });
    assert.equal(preOk.status, 200, "the pre-attempt token authenticates before the failed change (baseline)");

    const wrong = await api("POST", "/v1/auth/change-password", {
      token,
      body: { current_password: "not-the-current-password", new_password: "Secret5678!" },
    });
    assert.equal(wrong.status, 400, "a wrong current password must be a clean 400, never a 5xx or a silent success");
    assert.equal(wrong.body.error?.code, "WRONG_PASSWORD");

    // Password unchanged: the OLD password still signs in; the attempted NEW one does not.
    const oldStill = await api("POST", "/v1/auth/signin", { body: { username, password: "Secret1234!" } });
    assert.equal(oldStill.status, 200, "the old password must still work — a failed attempt must not change it");
    const newRejected = await api("POST", "/v1/auth/signin", { body: { username, password: "Secret5678!" } });
    assert.equal(newRejected.status, 401, "the attempted new password must NOT have taken effect");

    // session_version un-bumped: the token minted before the failed attempt still authenticates.
    // (If the bump fired on the failure path, this token would now be 401 — a stolen-token DoS.)
    const preStill = await api("GET", "/v1/user", { token: preToken });
    assert.equal(preStill.status, 200, "a failed change must NOT strand outstanding sessions (session_version un-bumped)");
  });

  test("AC3 · a SUCCESSFUL change is a full rotation: 200, old password rejected, new works, pre-change token revoked", async () => {
    const username = uniqueUsername("cp-rotate");
    const { token } = await registerUser("cp-rotate");

    // A token minted BEFORE the change — must be revoked by the session_version bump.
    const { body: pre } = await api("POST", "/v1/auth/signin", { body: { username, password: "Secret1234!" } });
    const preToken: string = pre.token;
    const preOk = await api("GET", "/v1/user", { token: preToken });
    assert.equal(preOk.status, 200, "the pre-change token authenticates before the change (baseline)");

    const changed = await api("POST", "/v1/auth/change-password", {
      token,
      body: { current_password: "Secret1234!", new_password: "Rotated9012!" },
    });
    assert.equal(changed.status, 200, "a correct current password must succeed");

    // Password rotated: old rejected at signin, new works.
    const oldNow = await api("POST", "/v1/auth/signin", { body: { username, password: "Secret1234!" } });
    assert.equal(oldNow.status, 401, "the old password must be rejected after a successful change");
    const newNow = await api("POST", "/v1/auth/signin", { body: { username, password: "Rotated9012!" } });
    assert.equal(newNow.status, 200, "the new password must work after a successful change");

    // Access revocation: the token minted before the change is now rejected (session_version bumped).
    const preRevoked = await api("GET", "/v1/user", { token: preToken });
    assert.equal(preRevoked.status, 401, "a successful change must strand tokens issued before it (session_version bump)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY / ROBUSTNESS — the /v1/sync CONTROL endpoints (#414)
//
// Coverage-gap audit (live route surface vs this matrix): the DFX daily suite
// covers the sync DATA-plane (`POST /v1/sync/pull` + `/push`, #255) but the four
// sync CONTROL endpoints had ZERO daily-suite presence:
//   GET  /v1/sync/status  — binding status (auth-gated)
//   POST /v1/sync/enable  — sign into cloud + bind (auth-gated, cloud-base-gated)
//   POST /v1/sync/disable — clear binding (auth-gated)
//   POST /v1/sync/now     — run one push-then-pull cycle (auth-gated)
//
// The load-bearing property with no test: `POST /v1/sync/enable` FAIL-CLOSES to
// `400 NO_CLOUD_BASE` when `LUMO_CLOUD_API_BASE` is unset. On the shared CLOUD
// deployment that env var is DELIBERATELY unset (the cloud backend never
// self-syncs; only the desktop's Electron launcher injects it). That guard is
// exactly what stops a tenant from making the shared server sign into an
// arbitrary cloud and push its data out — an SSRF / credential-exfiltration
// vector documented in `packages/contracts/src/sync.ts` + `routes/sync.ts`. A
// regression removing that guard (or the `authMiddleware`) would open the hole
// with no other test catching it. Mirrors the #411 `/v1/outlook` fail-closed +
// auth-gated pattern.
//
// Hermetic: this block DELETES `LUMO_CLOUD_API_BASE` in its before() so the
// fail-closed path is exercised deterministically (the daily ephemeral env and
// every default self-host already leave it absent), and `/enable` short-circuits
// on the env guard BEFORE any cloud sign-in / outbound fetch — zero network egress
// in the passing state.
//
// Handlers verified already correct → gap in the tests, not the code (test + docs
// only, no production change). Mutation-tested with perfect specificity: dropping
// `app.use("/*", authMiddleware)` reddens exactly AC1; removing the `if (!cloudBase)`
// NO_CLOUD_BASE guard reddens exactly AC2; removing the `NOT_ENABLED` throw in
// `syncNow` reddens exactly AC3's `/now` case.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Security/Robustness — /v1/sync control endpoints auth-gated & cloud fail-closed (#414)", () => {
  let syncOwner: { token: string; id: string };

  before(async () => {
    // Guarantee the cloud-deployment config (env var absent) regardless of the
    // ambient environment, so AC2's fail-closed guard is exercised deterministically.
    delete process.env.LUMO_CLOUD_API_BASE;
    syncOwner = await registerUser("sync-ctl-owner");
  });

  test("AC1 · all four control endpoints without a token → 401 UNAUTHORIZED", async () => {
    const cases: Array<[string, string, unknown?]> = [
      ["GET", "/v1/sync/status"],
      ["POST", "/v1/sync/enable", { email: "a@b.co", password: "x" }],
      ["POST", "/v1/sync/disable"],
      ["POST", "/v1/sync/now"],
    ];
    for (const [method, path, body] of cases) {
      const res = await api(method, path, { body });
      assert.equal(res.status, 401, `${method} ${path} is behind authMiddleware`);
      assert.equal(res.body.error?.code, "UNAUTHORIZED");
    }
  });

  test("AC1 · garbage bearer token → 401 (never 500)", async () => {
    const cases: Array<[string, string, unknown?]> = [
      ["GET", "/v1/sync/status"],
      ["POST", "/v1/sync/enable", { email: "a@b.co", password: "x" }],
      ["POST", "/v1/sync/disable"],
      ["POST", "/v1/sync/now"],
    ];
    for (const [method, path, body] of cases) {
      const res = await api(method, path, { body, token: "not.a.real.jwt" });
      assert.equal(res.status, 401, `${method} ${path} with a malformed bearer must be a clean 401, not a 5xx`);
      assert.equal(res.body.error?.code, "UNAUTHORIZED");
    }
  });

  test("AC2 · authenticated /enable with valid creds but LUMO_CLOUD_API_BASE unset → 400 NO_CLOUD_BASE (fail-closed, no outbound sign-in)", async () => {
    // The body is well-formed (passes SyncEnableRequestSchema) so the request
    // reaches the cloud-base guard; with the env var absent the handler
    // short-circuits to 400 NO_CLOUD_BASE BEFORE constructing a cloud client or
    // signing in — the shared cloud backend can never be told to enable outbound
    // sync. This is the SSRF / credential-exfiltration chokepoint.
    const { status, body } = await api("POST", "/v1/sync/enable", {
      token: syncOwner.token,
      body: { email: "someone@example.com", password: "whatever-creds" },
    });
    assert.equal(status, 400, "an unconfigured build must fail closed with 400 NO_CLOUD_BASE, never attempt a cloud sign-in");
    assert.equal(body.error?.code, "NO_CLOUD_BASE");
  });

  test("AC3 · a never-enabled user: /status → 200 {enabled:false} carrying no token; /now → 409 NOT_ENABLED; /disable → idempotent 200 {enabled:false}", async () => {
    const fresh = await registerUser("sync-ctl-fresh");

    // /status: not enabled, and the status view NEVER carries the cloud token.
    const status = await api("GET", "/v1/sync/status", { token: fresh.token });
    assert.equal(status.status, 200);
    assert.equal(status.body.enabled, false, "a user who never enabled sync must read enabled:false");
    assert.ok(
      !("token" in status.body) && !("cloudToken" in status.body) && !("cloud_token" in status.body),
      "the status response must never expose the cloud token (any casing)",
    );

    // /now: no active binding → 409 NOT_ENABLED (not a 5xx).
    const now = await api("POST", "/v1/sync/now", { token: fresh.token });
    assert.equal(now.status, 409, "running a cycle without an enabled binding must be a clean 409");
    assert.equal(now.body.error?.code, "NOT_ENABLED");

    // /disable: idempotent no-op for a never-bound user → 200 {enabled:false}.
    const disable = await api("POST", "/v1/sync/disable", { token: fresh.token });
    assert.equal(disable.status, 200, "disabling an already-disabled binding is an idempotent no-op");
    assert.equal(disable.body.enabled, false);
  });

  test("AC4 · /enable robustness: malformed JSON → 400 INVALID_JSON; bad-shape body → 400 BAD_REQUEST; the server survives", async () => {
    // Malformed JSON body → 400 INVALID_JSON (before schema validation).
    const bad = await rawApi("POST", "/v1/sync/enable", "{not json", syncOwner.token);
    assert.equal(bad.status, 400, "a corrupt JSON body must be a clean 400, not a 5xx");
    assert.equal(bad.body.error?.code, "INVALID_JSON");

    // Well-formed JSON but wrong shape (email fails .email()) → 400 BAD_REQUEST
    // from the handler's safeParse (distinct from INVALID_JSON, and reached before
    // the cloud-base guard).
    const badShape = await api("POST", "/v1/sync/enable", {
      token: syncOwner.token,
      body: { email: "not-an-email", password: "x" },
    });
    assert.equal(badShape.status, 400, "a bad-shape enable body must be rejected with 400");
    assert.equal(badShape.body.error?.code, "BAD_REQUEST");

    // Recoverability: the server is unharmed — a subsequent well-formed request
    // still returns its expected (fail-closed) 400 NO_CLOUD_BASE, proving the
    // endpoint is alive and the earlier malformed inputs did not wedge it.
    const after = await api("POST", "/v1/sync/enable", {
      token: syncOwner.token,
      body: { email: "someone@example.com", password: "whatever-creds" },
    });
    assert.equal(after.status, 400, "the endpoint must still respond after malformed input (not wedged)");
    assert.equal(after.body.error?.code, "NO_CLOUD_BASE");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for SECURITY / INTEROPERABILITY — the /v1/storage route family (#422)
//
// Coverage-gap audit (live route surface vs this matrix): the entire `/v1/storage`
// route family (`routes/storage.ts` — a single endpoint, `GET /v1/storage/info`)
// had ZERO test coverage ANYWHERE — no daily-suite row, no in-process `api/` test,
// no `@lumo/contracts` schema, and no entry in the hand-maintained OpenAPI spec
// (its response shape is defined inline in the handler).
//
// The endpoint returns server-global storage info — `{ dbPath, dbDir, dbName,
// dbSize }`, i.e. the server's ABSOLUTE DB filesystem path and total DB file size.
// It exists for the desktop "Data & Sync" settings tab (hidden on web builds,
// #181), but in the shared CLOUD multi-tenant deployment the route is still
// mounted and reachable.
//
// Two load-bearing production properties, none previously pinned:
//   • AuthN — the route sits behind `app.use("/*", authMiddleware)`, the ONLY
//     barrier stopping an anonymous caller from reading the server's absolute
//     filesystem path + total DB size. A missing/garbage token must be 401, never
//     a 5xx (AC1). This is the security-relevant guard: drop the middleware and the
//     path/size disclosure goes public.
//   • Stable contract + no over-disclosure — a valid caller gets a well-formed
//     `{ dbPath, dbDir, dbName, dbSize:number>=0 }`, the body leaks NO
//     secret/token/password/credential-shaped field, and the info is intentionally
//     SERVER-GLOBAL (a second distinct tenant reads the identical `dbPath`),
//     pinning that the endpoint never accidentally becomes a per-user data leak or
//     degrades to a 5xx (AC2).
//
// Handler verified already correct → gap in the tests, not the code (test + docs
// only, no production change). Mutation-tested: dropping the auth middleware makes
// the anonymous/garbage calls return 200 and reddens exactly AC1.
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Security/Interoperability — /v1/storage/info auth-gated & stable-shaped (#422)", () => {
  let stOwner: { token: string; id: string };
  let stOther: { token: string; id: string };

  before(async () => {
    stOwner = await registerUser("storage-owner");
    stOther = await registerUser("storage-other");
  });

  test("AC1 · GET /v1/storage/info without a token → 401 UNAUTHORIZED", async () => {
    const { status, body } = await api("GET", "/v1/storage/info");
    assert.equal(status, 401, "/storage/info is behind authMiddleware — anon must not read the server DB path/size");
    assert.equal(body.error?.code, "UNAUTHORIZED");
  });

  test("AC1 · GET /v1/storage/info with a garbage bearer token → 401 (never 500)", async () => {
    for (const bad of ["not.a.real.jwt", "aaa.bbb.ccc"]) {
      const { status, body } = await api("GET", "/v1/storage/info", { token: bad });
      assert.equal(status, 401, `a malformed bearer ("${bad}") must be a clean 401, not a 5xx`);
      assert.equal(body.error?.code, "UNAUTHORIZED");
    }
  });

  test("AC2 · authed → 200 with a stable { dbPath, dbDir, dbName, dbSize } shape and no secret over-disclosure", async () => {
    const { status, body, contentType } = await api("GET", "/v1/storage/info", { token: stOwner.token });
    assert.equal(status, 200);
    assert.ok(contentType.includes("application/json"), "storage info must be JSON");

    // Documented shape — the four fields the desktop settings tab consumes.
    assert.equal(typeof body.dbPath, "string", "dbPath is a string path");
    assert.ok(body.dbPath.length > 0, "dbPath is non-empty");
    assert.equal(typeof body.dbDir, "string", "dbDir is a string");
    assert.equal(typeof body.dbName, "string", "dbName is a string");
    assert.equal(typeof body.dbSize, "number", "dbSize is a number");
    assert.ok(Number.isFinite(body.dbSize) && body.dbSize >= 0, "dbSize is a finite, nonnegative byte count");

    // No over-disclosure: this endpoint must never grow a secret/credential field.
    const leaky = Object.keys(body).filter((k) => /secret|token|password|credential|auth/i.test(k));
    assert.deepEqual(leaky, [], `storage info must not expose any secret-shaped field (found: ${leaky.join(", ")})`);
  });

  test("AC2 · the info is server-global, not tenant-scoped — a second distinct user reads the identical dbPath", async () => {
    // Pins the intended behavior: /storage/info is process/server info, not
    // per-user. If a regression accidentally folded caller data into the response
    // (or made it 5xx), the two tenants' dbPath would diverge / the call would fail.
    const a = await api("GET", "/v1/storage/info", { token: stOwner.token });
    const b = await api("GET", "/v1/storage/info", { token: stOther.token });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.body.dbPath, b.body.dbPath, "storage info is server-global — every tenant sees the same DB path");
    assert.equal(a.body.dbName, b.body.dbName, "dbName is server-global too");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design for ROBUSTNESS — `GET /v1/completed?date=` query param is format-bounded (#425)
//
// Coverage-gap audit (live route-surface diff vs the matrix): the completed route
// has daily-suite presence for its OTHER concerns — cross-tenant reopen IDOR (#165)
// and full-history keyset pagination (#202) — but the one `?date=` QUERY-param
// validator was untested at EVERY layer. It is a DISTINCT validation path from all
// the Zod body-field date anchors covered elsewhere (`due` #319, `countdowns.date`
// #240, habit check-in `date` #267, …): a hand-rolled `httpError(c, 400,
// "INVALID_DATE")` guarding a strict date-only regex (`^\d{4}-\d{2}-\d{2}$`,
// routes/completed.ts:47) — NOT the `validate()` middleware, so its error envelope
// (`INVALID_DATE`, not `VALIDATION_ERROR`) is its own. The param is the sole input
// to the `DATE(completed_at, 'localtime') = :date` day filter; a regression
// loosening the regex would push a junk string straight into that SQL — silently
// yielding an empty/garbage day view with NO status-code change, invisible to every
// existing case. The in-process `api/completed.test.ts` pins a valid `?date=` and a
// malformed `?cursor=` but never a malformed `?date=`; the daily suite never
// touched it at all — and PR CI never runs this suite.
//
// Gives the bound teeth without a wall-clock dependency: the two 400 cases pin the
// regex (garbage + a plausible-but-wrong full-datetime shape), and the valid case
// asserts the RESPONSE SHAPE the param selects — `?date=` → a bounded array (one
// day), no-date → the `{ items, nextCursor }` keyset object — proving the param is
// parsed and routes to the array branch, deterministically (no "today" math that
// could straddle a localtime midnight boundary).
// ═══════════════════════════════════════════════════════════════════════════════

describe("DFX · Robustness — GET /v1/completed?date= query param is format-bounded (#425)", () => {
  let owner: { token: string; id: string };

  before(async () => {
    owner = await registerUser("completed-date-bound");
  });

  test("malformed `date` → 400 INVALID_DATE (never a 5xx / silent empty day)", async () => {
    const { status, body } = await api("GET", "/v1/completed?date=someday", { token: owner.token });
    assert.equal(status, 400, "a junk date must be a client error, not 5xx or a silent 200");
    assert.equal(body.error?.code, "INVALID_DATE", "the completed date validator has its own envelope");
  });

  test("full-datetime `date` (a valid `scheduled_start` shape) → 400 — the date-only bound has teeth", async () => {
    // `"2026-06-20T09:30"` is a valid wall-clock datetime elsewhere but NOT a valid
    // `?date=`: the completed day filter is date-only, so the regex forbids a time
    // component. Proves the bound rejects a plausible-but-wrong-shape value, not
    // just obvious garbage.
    const { status, body } = await api("GET", "/v1/completed?date=2026-06-20T09:30", { token: owner.token });
    assert.equal(status, 400);
    assert.equal(body.error?.code, "INVALID_DATE", "a datetime where a date is required must still 400 INVALID_DATE");
  });

  test("valid `date` → 200 array (day view); no-date → 200 { items, nextCursor } — the param selects the shape", async () => {
    // A valid past date is accepted and yields the bounded per-day ARRAY shape.
    // 1999 is deterministically empty (every completion is server-stamped to the
    // present), which also proves the DATE() filter actually runs — it doesn't
    // dump the whole history.
    const day = await api("GET", "/v1/completed?date=1999-01-01", { token: owner.token });
    assert.equal(day.status, 200, "a well-formed date must be accepted");
    assert.ok(Array.isArray(day.body), "the `?date=` path returns a bare array (one bounded day)");
    assert.equal(day.body.length, 0, "no entries were completed in 1999 — proves the date filter scopes, not a match-all");

    // The no-date path is a DIFFERENT shape: the keyset-paginated object. Asserting
    // both in one test proves the `date` param is parsed and switches the branch
    // (teeth: if the param were ignored, both calls would return the same shape).
    const hist = await api("GET", "/v1/completed", { token: owner.token });
    assert.equal(hist.status, 200);
    assert.ok(!Array.isArray(hist.body), "the no-date path returns the { items, nextCursor } object, not an array");
    assert.ok(Array.isArray(hist.body.items), "the full-history shape carries an `items` array");
    assert.ok("nextCursor" in hist.body, "the full-history shape carries a `nextCursor` field");
  });
});
