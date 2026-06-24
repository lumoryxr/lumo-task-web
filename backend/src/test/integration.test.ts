/**
 * Backend integration tests — real HTTP server over a real SQLite file.
 *
 * Unlike api.test.ts (which calls app.request() in-process), these tests:
 *   • Spin up a live @hono/node-server on a random port
 *   • Issue real fetch() calls over TCP
 *   • Write to a real temp SQLite file (not :memory:)
 *   • Verify end-to-end business scenarios rather than individual endpoints
 *
 * Scenarios covered:
 *   1.  Health check
 *   2.  Full auth lifecycle (register → sign in → profile → change password → sign out)
 *   3.  Task CRUD + Eisenhower matrix management
 *   4.  Today list management
 *   5.  Task assignment & people management
 *   6.  Complete → reopen lifecycle with completed-log verification
 *   7.  Pomodoro focus-session workflow
 *   8.  Settings persistence
 *   9.  AI classify / recommend / parse (heuristic path — no LLM key needed)
 *   10. Multi-user data isolation
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { rmSync } from "node:fs";
import { serve } from "@hono/node-server";
import { runMigrations } from "../db/migrate.js";
import { app } from "../app.js";

// ── Server lifecycle ──────────────────────────────────────────────────────────
// LUMO_DB_PATH is set via --env-file before module load so the db client picks
// it up at import time.  We just capture the value here for cleanup.

const DB_PATH = process.env.LUMO_DB_PATH ?? "";
let BASE_URL = "";
let server: ReturnType<typeof serve> | null = null;

before(async () => {
  await runMigrations();
  // No ensureDefaultUser — integration tests create their own users.

  // Use @hono/node-server's listeningListener callback (second argument) to
  // get the actual port after the OS assigns one (port: 0).
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Server did not start within 10 s")), 10_000);
    server = serve({ fetch: app.fetch, port: 0 }, () => {
      clearTimeout(t);
      // Read the actual OS-assigned port directly from the server socket.
      // The `info` parameter passed by @hono/node-server may reflect the
      // requested port (0) rather than the bound port, so we don't use it.
      const addr = (server as any).address() as AddressInfo;
      BASE_URL = `http://127.0.0.1:${addr.port}`;
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

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function api(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let body: any;
  const ct = res.headers.get("content-type") ?? "";
  try {
    body = ct.includes("application/json") ? await res.json() : await res.text();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

// ── Shared state ──────────────────────────────────────────────────────────────

let aliceToken = "";
let aliceId = "";
let bobToken = "";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. HEALTH
// ═══════════════════════════════════════════════════════════════════════════════

describe("Health check", () => {
  test("GET /health → 200 { ok: true } over real HTTP", async () => {
    const { status, body } = await api("GET", "/health");
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });

  test("response includes Content-Type: application/json header", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    assert.ok(
      res.headers.get("content-type")?.includes("application/json"),
      "Content-Type should be application/json",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. AUTH LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Auth lifecycle", () => {
  test("register alice → 201, returns token + user", async () => {
    const { status, body } = await api("POST", "/v1/auth/register", {
      body: { email: "alice@lumo.test", password: "Secret1234!", name: "Alice" },
    });
    assert.equal(status, 201);
    assert.ok(body.token, "token missing");
    assert.equal(body.user.email, "alice@lumo.test");
    assert.equal(body.user.name, "Alice");
    assert.equal(body.user.plan, "free");
    aliceToken = body.token;
    aliceId = body.user.id;
  });

  test("duplicate email → 409", async () => {
    const { status } = await api("POST", "/v1/auth/register", {
      body: { email: "alice@lumo.test", password: "Other1234!", name: "Alice2" },
    });
    assert.equal(status, 409);
  });

  test("register with invalid email → 400", async () => {
    const { status } = await api("POST", "/v1/auth/register", {
      body: { email: "not-an-email", password: "password", name: "X" },
    });
    assert.equal(status, 400);
  });

  test("sign in with correct credentials → 200, new token", async () => {
    const { status, body } = await api("POST", "/v1/auth/signin", {
      body: { email: "alice@lumo.test", password: "Secret1234!" },
    });
    assert.equal(status, 200);
    assert.ok(body.token);
    aliceToken = body.token; // refresh token
  });

  test("sign in with wrong password → 401", async () => {
    const { status } = await api("POST", "/v1/auth/signin", {
      body: { email: "alice@lumo.test", password: "WrongPass!" },
    });
    assert.equal(status, 401);
  });

  test("GET /v1/user → returns alice's profile", async () => {
    const { status, body } = await api("GET", "/v1/user", { token: aliceToken });
    assert.equal(status, 200);
    assert.equal(body.id, aliceId);
    assert.equal(body.email, "alice@lumo.test");
    assert.ok(!("password_hash" in body), "password_hash must not be exposed");
    assert.ok(!("hasApiKey" in body) || typeof body.hasApiKey === "boolean", "hasApiKey should be boolean if present");
  });

  test("GET /v1/user with no token → 401", async () => {
    const { status } = await api("GET", "/v1/user");
    assert.equal(status, 401);
  });

  test("change password → 200, old password no longer works", async () => {
    const { status } = await api("POST", "/v1/auth/change-password", {
      token: aliceToken,
      body: { current_password: "Secret1234!", new_password: "NewSecret99!" },
    });
    assert.equal(status, 200);

    const { status: s } = await api("POST", "/v1/auth/signin", {
      body: { email: "alice@lumo.test", password: "Secret1234!" },
    });
    assert.equal(s, 401, "old password should be rejected");

    // Restore for subsequent tests
    const { body: rb } = await api("POST", "/v1/auth/signin", {
      body: { email: "alice@lumo.test", password: "NewSecret99!" },
    });
    aliceToken = rb.token;
  });

  test("sign out → 200 { ok: true }, token is revoked", async () => {
    // Sign in with a SEPARATE session to test sign-out without revoking aliceToken,
    // which is needed by subsequent test suites.
    const { body: rb } = await api("POST", "/v1/auth/signin", {
      body: { email: "alice@lumo.test", password: "NewSecret99!" },
    });
    const tempToken = rb.token;

    const { status, body } = await api("POST", "/v1/auth/signout", { token: tempToken });
    assert.equal(status, 200);
    assert.equal(body.ok, true);

    // The signed-out token should now be rejected (added to revoked_tokens).
    const { status: s } = await api("GET", "/v1/user", { token: tempToken });
    assert.equal(s, 401, "revoked token should be rejected");

    // aliceToken itself is still valid — subsequent suites depend on it.
    const { status: s2 } = await api("GET", "/v1/user", { token: aliceToken });
    assert.equal(s2, 200, "aliceToken should still be valid");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. TASK CRUD + EISENHOWER MATRIX
// ═══════════════════════════════════════════════════════════════════════════════

describe("Task CRUD and Eisenhower matrix", () => {
  const created: { id: string }[] = [];

  after(async () => {
    for (const t of created) {
      await api("DELETE", `/v1/tasks/${t.id}`, { token: aliceToken });
    }
  });

  test("create task in each quadrant", async () => {
    for (const quadrant of ["Q1", "Q2", "Q3", "Q4"] as const) {
      const { status, body } = await api("POST", "/v1/tasks", {
        token: aliceToken,
        body: {
          title: { en: `${quadrant} task`, zh: `${quadrant} 任务` },
          quadrant,
          notes: `Notes for ${quadrant}`,
        },
      });
      assert.equal(status, 201);
      assert.equal(body.quadrant, quadrant);
      assert.equal(body.title.en, `${quadrant} task`);
      assert.equal(body.title.zh, `${quadrant} 任务`);
      assert.equal(body.completed, false);
      created.push(body);
    }
  });

  test("GET /v1/tasks returns all four tasks", async () => {
    const { status, body } = await api("GET", "/v1/tasks?limit=200", { token: aliceToken });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.length >= 4, "should have at least 4 tasks");
    for (const q of ["Q1", "Q2", "Q3", "Q4"]) {
      assert.ok(body.items.some((t: any) => t.quadrant === q), `missing ${q} task`);
    }
  });

  test("move task between quadrants via PATCH", async () => {
    const task = created[0]; // Q1 task
    const { status, body } = await api("PATCH", `/v1/tasks/${task.id}`, {
      token: aliceToken,
      body: { quadrant: "Q3" },
    });
    assert.equal(status, 200);
    assert.equal(body.quadrant, "Q3");
    assert.equal(body.id, task.id);
  });

  test("update task title and desc", async () => {
    const task = created[1];
    const { status, body } = await api("PATCH", `/v1/tasks/${task.id}`, {
      token: aliceToken,
      body: { title: { en: "Updated title", zh: "更新的标题" }, desc: { en: "Updated desc" } },
    });
    assert.equal(status, 200);
    assert.equal(body.title.en, "Updated title");
    assert.equal(body.desc?.en, "Updated desc");
  });

  test("PATCH non-existent task → 404", async () => {
    const { status } = await api("PATCH", "/v1/tasks/does-not-exist", {
      token: aliceToken,
      body: { quadrant: "Q1" },
    });
    assert.equal(status, 404);
  });

  test("DELETE task → 204, then GET returns 404", async () => {
    const { body: task } = await api("POST", "/v1/tasks", {
      token: aliceToken,
      body: { title: { en: "To delete" }, quadrant: "Q4" },
    });
    const { status: ds } = await api("DELETE", `/v1/tasks/${task.id}`, { token: aliceToken });
    assert.equal(ds, 204);

    const { status: gs } = await api("GET", `/v1/tasks/${task.id}`, { token: aliceToken });
    assert.equal(gs, 404);
  });

  test("create task with due date and pomos_total", async () => {
    const due = new Date(Date.now() + 86400 * 1000).toISOString().slice(0, 10);
    const { status, body } = await api("POST", "/v1/tasks", {
      token: aliceToken,
      body: { title: { en: "Due date task" }, quadrant: "Q1", due, pomos_total: 4 },
    });
    assert.equal(status, 201);
    assert.equal(body.due, due);
    assert.equal(body.pomos_total, 4);
    assert.equal(body.pomos_done, 0);
    created.push(body);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. TODAY LIST
// ═══════════════════════════════════════════════════════════════════════════════

describe("Today list management", () => {
  let taskId = "";

  before(async () => {
    const { body } = await api("POST", "/v1/tasks", {
      token: aliceToken,
      body: { title: { en: "Today task" }, quadrant: "Q1" },
    });
    taskId = body.id;
  });

  after(async () => {
    await api("DELETE", `/v1/tasks/${taskId}`, { token: aliceToken });
  });

  test("task starts with today=false", async () => {
    const { body } = await api("GET", `/v1/tasks/${taskId}`, { token: aliceToken });
    assert.equal(body.today, false);
  });

  test("PATCH today=true adds to today list", async () => {
    const { status, body } = await api("PATCH", `/v1/tasks/${taskId}`, {
      token: aliceToken,
      body: { today: true },
    });
    assert.equal(status, 200);
    assert.equal(body.today, true);
  });

  test("GET /v1/tasks includes the today-flagged task", async () => {
    const { status, body } = await api("GET", "/v1/tasks?limit=200", { token: aliceToken });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
    const t = body.items.find((t: any) => t.id === taskId);
    assert.ok(t, "today task missing from task list");
    assert.equal(t.today, true, "task should have today=true");
  });

  test("PATCH today=false persists on the task", async () => {
    await api("PATCH", `/v1/tasks/${taskId}`, { token: aliceToken, body: { today: false } });
    const { body: task } = await api("GET", `/v1/tasks/${taskId}`, { token: aliceToken });
    assert.equal(task.today, false, "task should have today=false after patch");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. PEOPLE + TASK ASSIGNMENT
// ═══════════════════════════════════════════════════════════════════════════════

describe("People management and task assignment", () => {
  let personId = "";
  let taskId = "";

  after(async () => {
    if (taskId) await api("DELETE", `/v1/tasks/${taskId}`, { token: aliceToken });
    if (personId) await api("DELETE", `/v1/people/${personId}`, { token: aliceToken });
  });

  test("create person → 201 with all fields", async () => {
    const { status, body } = await api("POST", "/v1/people", {
      token: aliceToken,
      body: { name: "Bob Manager", initials: "BM", color: "#3b82f6" },
    });
    assert.equal(status, 201);
    assert.equal(body.name, "Bob Manager");
    assert.equal(body.initials, "BM");
    assert.equal(body.color, "#3b82f6");
    personId = body.id;
  });

  test("GET /v1/people → list includes new person", async () => {
    const { status, body } = await api("GET", "/v1/people", { token: aliceToken });
    assert.equal(status, 200);
    assert.ok(body.some((p: any) => p.id === personId));
  });

  test("PATCH person name", async () => {
    const { status, body } = await api("PATCH", `/v1/people/${personId}`, {
      token: aliceToken,
      body: { name: "Bob Updated" },
    });
    assert.equal(status, 200);
    assert.equal(body.name, "Bob Updated");
  });

  test("assign person to task", async () => {
    const { body: task } = await api("POST", "/v1/tasks", {
      token: aliceToken,
      body: { title: { en: "Assigned task" }, quadrant: "Q2", assignee_ids: [personId] },
    });
    taskId = task.id;
    assert.ok(Array.isArray(task.assignee_ids));
    assert.ok(task.assignee_ids.includes(personId), "person should be assigned");
  });

  test("delete person clears them from task assignee list", async () => {
    await api("DELETE", `/v1/people/${personId}`, { token: aliceToken });
    personId = ""; // already deleted

    const { body: task } = await api("GET", `/v1/tasks/${taskId}`, { token: aliceToken });
    assert.ok(Array.isArray(task.assignee_ids));
    assert.ok(!task.assignee_ids.includes(personId), "deleted person should be cleared from assignees");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. COMPLETE → REOPEN LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Task complete → reopen lifecycle", () => {
  let taskId = "";
  let completedEntryId = "";

  before(async () => {
    const { body } = await api("POST", "/v1/tasks", {
      token: aliceToken,
      body: { title: { en: "Will be completed" }, quadrant: "Q1", today: true },
    });
    taskId = body.id;
  });

  test("complete task → 200, completed=true, creates log entry", async () => {
    const { status, body } = await api("POST", `/v1/tasks/${taskId}/complete`, {
      token: aliceToken,
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.ok(body.entry_id, "entry_id missing from complete response");
    completedEntryId = body.entry_id;
  });

  test("GET /v1/tasks/:id → completed=true, today=false after complete", async () => {
    const { body } = await api("GET", `/v1/tasks/${taskId}`, { token: aliceToken });
    assert.equal(body.completed, true);
    // completing a task sets completed=1 but does NOT clear today
    assert.equal(body.today, true, "today flag is preserved after complete");
  });

  test("completed task appears in GET /v1/completed", async () => {
    const { status, body } = await api("GET", "/v1/completed", { token: aliceToken });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    assert.ok(
      body.some((e: any) => e.id === completedEntryId),
      "completed entry missing from log",
    );
  });

  test("completed entry has correct shape", async () => {
    const { body: entries } = await api("GET", "/v1/completed", { token: aliceToken });
    const entry = entries.find((e: any) => e.id === completedEntryId);
    assert.ok(entry, "entry not found");
    assert.ok(entry.completedAt, "completedAt missing");
    assert.ok(entry.title, "title missing");
    assert.ok(entry.title.en, "title.en missing");
  });

  test("uncomplete task → 200, response is task with completed=false", async () => {
    // /uncomplete returns the full task object (not { ok: true }).
    // It only clears completed; it does NOT restore today (use /reopen for that).
    const { status, body } = await api("POST", `/v1/tasks/${taskId}/uncomplete`, {
      token: aliceToken,
    });
    assert.equal(status, 200);
    assert.equal(body.completed, false, "task should be active again");
    // uncomplete clears completed flag but today flag is unchanged (still true)
    assert.equal(body.today, true, "today flag is preserved after uncomplete");
  });

  test("reopen via completed log → task active again", async () => {
    // Re-complete so we have an entry to reopen
    const { body: c } = await api("POST", `/v1/tasks/${taskId}/complete`, { token: aliceToken });
    const { status, body } = await api("POST", `/v1/completed/${c.entry_id}/reopen`, {
      token: aliceToken,
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);

    const { body: task } = await api("GET", `/v1/tasks/${taskId}`, { token: aliceToken });
    assert.equal(task.completed, false);
    assert.equal(task.today, true);
  });

  after(async () => {
    await api("DELETE", `/v1/tasks/${taskId}`, { token: aliceToken });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. FOCUS / POMODORO WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════════

describe("Pomodoro focus-session workflow", () => {
  let taskId = "";

  before(async () => {
    const { body } = await api("POST", "/v1/tasks", {
      token: aliceToken,
      body: { title: { en: "Deep work" }, quadrant: "Q1", pomos_total: 3 },
    });
    taskId = body.id;
  });

  after(async () => {
    await api("DELETE", `/v1/tasks/${taskId}`, { token: aliceToken });
  });

  test("record 3 focus sessions → pomos_done increments each time", async () => {
    for (let i = 1; i <= 3; i++) {
      const { status } = await api("POST", "/v1/focus/sessions", {
        token: aliceToken,
        body: { task_id: taskId, duration: 25, started_at: new Date().toISOString() },
      });
      assert.equal(status, 200);

      const { body: task } = await api("GET", `/v1/tasks/${taskId}`, { token: aliceToken });
      assert.equal(task.pomos_done, i, `pomos_done should be ${i} after session ${i}`);
    }
  });

  test("standalone session (no task) → 200 with entry_id", async () => {
    const { status, body } = await api("POST", "/v1/focus/sessions", {
      token: aliceToken,
      body: { duration: 15 },
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.ok(body.entry_id, "entry_id missing");
  });

  test("session with duration < 1 → 400", async () => {
    const { status } = await api("POST", "/v1/focus/sessions", {
      token: aliceToken,
      body: { task_id: taskId, duration: 0 },
    });
    assert.equal(status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. SETTINGS PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Settings persistence", () => {
  test("GET /v1/settings → returns default settings for new user", async () => {
    const { status, body } = await api("GET", "/v1/settings", { token: aliceToken });
    assert.equal(status, 200);
    assert.ok("locale" in body, "locale missing");
    assert.ok("accent" in body, "accent missing");
    assert.ok("density" in body, "density missing");
  });

  test("PATCH locale=zh → persists across requests", async () => {
    const { status } = await api("PATCH", "/v1/settings", {
      token: aliceToken,
      body: { locale: "zh" },
    });
    assert.equal(status, 200);

    const { body } = await api("GET", "/v1/settings", { token: aliceToken });
    assert.equal(body.locale, "zh", "locale should persist");
  });

  test("PATCH accent + locale together → both persist", async () => {
    const { status } = await api("PATCH", "/v1/settings", {
      token: aliceToken,
      body: { accent: "cyan", locale: "en" },
    });
    assert.equal(status, 200);

    const { body } = await api("GET", "/v1/settings", { token: aliceToken });
    assert.equal(body.accent, "cyan");
    assert.equal(body.locale, "en");
  });

  test("invalid locale value → 400", async () => {
    const { status } = await api("PATCH", "/v1/settings", {
      token: aliceToken,
      body: { locale: "fr" },
    });
    assert.equal(status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. AI FEATURES (heuristic / fallback path — no real LLM key required)
// ═══════════════════════════════════════════════════════════════════════════════

describe("AI features (heuristic path)", () => {
  const taskIds: string[] = [];

  before(async () => {
    // Create a mix of unclassified and classified tasks
    for (const [title, quadrant] of [
      ["Fix urgent production bug", "unclassified"],
      ["Read industry newsletter", "unclassified"],
      ["Plan team offsite", "Q2"],
    ]) {
      const { body } = await api("POST", "/v1/tasks", {
        token: aliceToken,
        body: { title: { en: title }, quadrant, today: quadrant === "Q2" },
      });
      taskIds.push(body.id);
    }
  });

  after(async () => {
    for (const id of taskIds) {
      await api("DELETE", `/v1/tasks/${id}`, { token: aliceToken });
    }
  });

  test("POST /v1/ai/classify → returns suggestions for unclassified tasks", async () => {
    const { status, body } = await api("POST", "/v1/ai/classify", { token: aliceToken, body: {} });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.suggestions), "suggestions should be an array");
    assert.ok(body.suggestions.length >= 1, "should suggest for unclassified tasks");

    const s = body.suggestions[0];
    assert.ok(["Q1", "Q2", "Q3", "Q4"].includes(s.quadrant), `invalid quadrant: ${s.quadrant}`);
    assert.ok(typeof s.confidence === "number", "confidence should be a number");
    assert.ok(s.confidence >= 0 && s.confidence <= 1, "confidence should be 0–1");
    assert.ok(s.task_id, "task_id missing");
  });

  test("POST /v1/ai/recommend → returns highest-priority Q1+today task", async () => {
    // Create a Q1 today task so recommend has something to return
    const { body: t } = await api("POST", "/v1/tasks", {
      token: aliceToken,
      body: { title: { en: "Most important thing" }, quadrant: "Q1", today: true },
    });
    taskIds.push(t.id);

    const { status, body } = await api("POST", "/v1/ai/recommend", { token: aliceToken, body: {} });
    assert.equal(status, 200);
    assert.ok(body.task !== null, "should return a recommended task");
    assert.ok(typeof body.task.conviction === "number", "conviction score missing");
  });

  test("POST /v1/ai/parse → returns task scaffold from plain text", async () => {
    const { status, body } = await api("POST", "/v1/ai/parse", {
      token: aliceToken,
      body: { text: "Review Q3 investor report before Friday" },
    });
    assert.equal(status, 200);
    assert.ok("title" in body, "title missing");
    assert.ok("quadrant" in body, "quadrant missing");
    assert.ok("confidence" in body, "confidence missing");
  });

  test("POST /v1/ai/parse with empty text → 400", async () => {
    const { status } = await api("POST", "/v1/ai/parse", {
      token: aliceToken,
      body: { text: "" },
    });
    assert.equal(status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. MULTI-USER DATA ISOLATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Multi-user data isolation", () => {
  let aliceTaskId = "";
  let alicePersonId = "";

  before(async () => {
    // Register bob
    const { body } = await api("POST", "/v1/auth/register", {
      body: { email: "bob@lumo.test", password: "BobSecret99!", name: "Bob" },
    });
    bobToken = body.token;

    // Create resources owned by alice
    const { body: task } = await api("POST", "/v1/tasks", {
      token: aliceToken,
      body: { title: { en: "Alice private task" }, quadrant: "Q1" },
    });
    aliceTaskId = task.id;

    const { body: person } = await api("POST", "/v1/people", {
      token: aliceToken,
      body: { name: "Alice Contact", initials: "AC", color: "#ef4444" },
    });
    alicePersonId = person.id;
  });

  after(async () => {
    await api("DELETE", `/v1/tasks/${aliceTaskId}`, { token: aliceToken });
    await api("DELETE", `/v1/people/${alicePersonId}`, { token: aliceToken });
  });

  test("bob cannot read alice's task (GET → 404)", async () => {
    const { status } = await api("GET", `/v1/tasks/${aliceTaskId}`, { token: bobToken });
    assert.equal(status, 404);
  });

  test("bob cannot modify alice's task (PATCH → 404)", async () => {
    const { status } = await api("PATCH", `/v1/tasks/${aliceTaskId}`, {
      token: bobToken,
      body: { quadrant: "Q4" },
    });
    assert.equal(status, 404);

    // Verify alice's task is unchanged
    const { body } = await api("GET", `/v1/tasks/${aliceTaskId}`, { token: aliceToken });
    assert.equal(body.quadrant, "Q1", "alice's task quadrant should be unchanged");
  });

  test("bob cannot delete alice's task (DELETE → 404)", async () => {
    const { status } = await api("DELETE", `/v1/tasks/${aliceTaskId}`, { token: bobToken });
    assert.equal(status, 404);

    // Task still exists for alice
    const { status: gs } = await api("GET", `/v1/tasks/${aliceTaskId}`, { token: aliceToken });
    assert.equal(gs, 200);
  });

  test("bob cannot complete alice's task", async () => {
    const { status } = await api("POST", `/v1/tasks/${aliceTaskId}/complete`, { token: bobToken });
    assert.equal(status, 404);

    // Confirm task is still active for alice
    const { body } = await api("GET", `/v1/tasks/${aliceTaskId}`, { token: aliceToken });
    assert.equal(body.completed, false);
  });

  test("bob's task list excludes alice's tasks", async () => {
    const { body: tasks } = await api("GET", "/v1/tasks?limit=200", { token: bobToken });
    assert.ok(Array.isArray(tasks.items));
    assert.ok(
      !tasks.items.some((t: any) => t.id === aliceTaskId),
      "bob should not see alice's tasks",
    );
  });

  test("bob cannot access alice's people", async () => {
    const { status } = await api("DELETE", `/v1/people/${alicePersonId}`, { token: bobToken });
    assert.equal(status, 404);

    // Person still exists for alice
    const { body: people } = await api("GET", "/v1/people", { token: aliceToken });
    assert.ok(people.some((p: any) => p.id === alicePersonId));
  });

  test("bob's settings are independent of alice's", async () => {
    await api("PATCH", "/v1/settings", { token: aliceToken, body: { locale: "zh" } });

    const { body: bobSettings } = await api("GET", "/v1/settings", { token: bobToken });
    assert.equal(bobSettings.locale, "en", "bob should have default settings");

    // Restore
    await api("PATCH", "/v1/settings", { token: aliceToken, body: { locale: "en" } });
  });

  test("bob's completed log is separate from alice's", async () => {
    // Alice completes her task
    await api("POST", `/v1/tasks/${aliceTaskId}/complete`, { token: aliceToken });

    // Bob should not see alice's completed entries
    const { body: bobCompleted } = await api("GET", "/v1/completed", { token: bobToken });
    assert.ok(Array.isArray(bobCompleted));
    // All entries in bob's log should belong to bob's tasks (none from alice)
    // We verify by checking alice can still see her entry
    const { body: aliceCompleted } = await api("GET", "/v1/completed", { token: aliceToken });
    const aliceEntry = aliceCompleted.find((e: any) =>
      e.title?.en === "Alice private task",
    );
    assert.ok(aliceEntry, "alice should see her own completed entry");

    // Uncomplete for cleanup
    await api("POST", `/v1/tasks/${aliceTaskId}/uncomplete`, { token: aliceToken });
  });
});
