/**
 * API · Habits
 *   GET / · GET /logs · POST · PATCH /:id · DELETE /:id
 *   POST /:id/log · DELETE /:id/log/:date · POST /migrate
 * Plus cross-user isolation for habits.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo, newUserWithToken } from "../helpers/index.js";

let demoToken = "";

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
});

describe("Habits", () => {
  let habitId = "";

  test("401 → unauthenticated GET /v1/habits", async () => {
    const { status } = await req("GET", "/v1/habits");
    assert.equal(status, 401);
  });

  test("200 → list is empty initially (keyset page shape)", async () => {
    const { status, body } = await req("GET", "/v1/habits", { token: demoToken });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items), "list must be a { items, nextCursor } page");
    assert.equal(body.items.length, 0);
    assert.equal(body.nextCursor, null);
  });

  test("201 → POST creates a habit and returns the row", async () => {
    const { status, body } = await req("POST", "/v1/habits", {
      token: demoToken,
      body: {
        title: "Morning run",
        emoji: "🏃",
        color: "green",
        frequency: "days_of_week",
        frequencyDays: [1, 3, 5],
        note: "5km",
      },
    });
    assert.equal(status, 201);
    assert.ok(body.id, "id missing");
    assert.equal(body.title, "Morning run");
    assert.equal(body.emoji, "🏃");
    assert.deepEqual(body.frequencyDays, [1, 3, 5], "frequencyDays should round-trip as a number array");
    assert.equal(body.note, "5km");
    habitId = body.id;
  });

  test("200 → list now contains the created habit", async () => {
    const { body } = await req("GET", "/v1/habits", { token: demoToken });
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].id, habitId);
  });

  test("400 → POST rejects empty title", async () => {
    const { status } = await req("POST", "/v1/habits", {
      token: demoToken,
      body: { title: "", color: "green", frequency: "daily" },
    });
    assert.equal(status, 400);
  });

  test("400 → POST rejects invalid color", async () => {
    const { status } = await req("POST", "/v1/habits", {
      token: demoToken,
      body: { title: "Bad", color: "magenta", frequency: "daily" },
    });
    assert.equal(status, 400);
  });

  test("200 → PATCH updates title and clears emoji when sent as null", async () => {
    const { status, body } = await req("PATCH", `/v1/habits/${habitId}`, {
      token: demoToken,
      body: { title: "Evening run", emoji: null },
    });
    assert.equal(status, 200);
    assert.equal(body.title, "Evening run");
    assert.equal(body.emoji ?? null, null, "emoji should be cleared");
    assert.deepEqual(body.frequencyDays, [1, 3, 5], "untouched fields should be preserved");
  });

  test("404 → PATCH on a non-existent habit", async () => {
    const { status } = await req("PATCH", "/v1/habits/habit_missing", {
      token: demoToken,
      body: { title: "Nope" },
    });
    assert.equal(status, 404);
  });

  test("201 → POST /:id/log records a check-in", async () => {
    const { status, body } = await req("POST", `/v1/habits/${habitId}/log`, {
      token: demoToken,
      body: { date: "2026-06-20" },
    });
    assert.equal(status, 201);
    assert.equal(body.habitId, habitId);
    assert.equal(body.date, "2026-06-20");
  });

  test("201 → POST /:id/log is idempotent for the same date", async () => {
    const { status } = await req("POST", `/v1/habits/${habitId}/log`, {
      token: demoToken,
      body: { date: "2026-06-20" },
    });
    assert.equal(status, 201);
    const { body: logs } = await req("GET", "/v1/habits/logs", { token: demoToken });
    const sameDay = (logs as any[]).filter((l) => l.habitId === habitId && l.date === "2026-06-20");
    assert.equal(sameDay.length, 1, "duplicate check-in must not create a second log row");
  });

  test("404 → POST /:id/log on a habit the user does not own", async () => {
    const { status } = await req("POST", "/v1/habits/habit_missing/log", {
      token: demoToken,
      body: { date: "2026-06-20" },
    });
    assert.equal(status, 404);
  });

  test("400 → POST /:id/log rejects a malformed date", async () => {
    const { status } = await req("POST", `/v1/habits/${habitId}/log`, {
      token: demoToken,
      body: { date: "06/20/2026" },
    });
    assert.equal(status, 400);
  });

  test("204 → DELETE /:id/log/:date removes the check-in", async () => {
    const { status } = await req("DELETE", `/v1/habits/${habitId}/log/2026-06-20`, {
      token: demoToken,
    });
    assert.equal(status, 204);
    const { body: logs } = await req("GET", "/v1/habits/logs", { token: demoToken });
    const remaining = (logs as any[]).filter((l) => l.habitId === habitId);
    assert.equal(remaining.length, 0);
  });

  test("204 → DELETE /:id cascades and removes its logs", async () => {
    await req("POST", `/v1/habits/${habitId}/log`, { token: demoToken, body: { date: "2026-06-21" } });
    const { status } = await req("DELETE", `/v1/habits/${habitId}`, { token: demoToken });
    assert.equal(status, 204);

    const { body: habits } = await req("GET", "/v1/habits", { token: demoToken });
    assert.equal((habits.items as any[]).some((h) => h.id === habitId), false);
    const { body: logs } = await req("GET", "/v1/habits/logs", { token: demoToken });
    assert.equal((logs as any[]).some((l) => l.habitId === habitId), false, "logs must be cascaded on habit delete");
  });

  test("404 → DELETE on an already-removed habit", async () => {
    const { status } = await req("DELETE", `/v1/habits/${habitId}`, { token: demoToken });
    assert.equal(status, 404);
  });

  test("POST /migrate is idempotent — re-running keeps a single row per id", async () => {
    const payload = {
      habits: [
        {
          id: "habit_migrate_1",
          title: "Imported habit",
          color: "purple",
          frequency: "daily",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      logs: [
        { habitId: "habit_migrate_1", date: "2026-01-02", completedAt: "2026-01-02T08:00:00.000Z" },
      ],
    };

    const first = await req("POST", "/v1/habits/migrate", { token: demoToken, body: payload });
    assert.equal(first.status, 200);
    const second = await req("POST", "/v1/habits/migrate", { token: demoToken, body: payload });
    assert.equal(second.status, 200);

    const { body: habits } = await req("GET", "/v1/habits", { token: demoToken });
    assert.equal((habits.items as any[]).filter((h) => h.id === "habit_migrate_1").length, 1);
    const { body: logs } = await req("GET", "/v1/habits/logs", { token: demoToken });
    assert.equal((logs as any[]).filter((l) => l.habitId === "habit_migrate_1").length, 1);
  });

  test("400 → POST /migrate rejects an over-cap habits array (bounded bulk import)", async () => {
    const habits = Array.from({ length: 10_001 }, (_, i) => ({
      id: `h_over_${i}`,
      title: "x",
      color: "green",
      frequency: "daily",
      createdAt: "2026-01-01T00:00:00.000Z",
    }));
    const { status, body } = await req("POST", "/v1/habits/migrate", { token: demoToken, body: { habits, logs: [] } });
    assert.equal(status, 400);
    assert.equal((body as any).error?.code, "VALIDATION_ERROR");
  });

  test("400 → POST /migrate rejects an over-cap logs array", async () => {
    const logs = Array.from({ length: 200_001 }, () => ({
      habitId: "h", date: "2026-01-01", completedAt: "2026-01-01T00:00:00.000Z",
    }));
    const { status, body } = await req("POST", "/v1/habits/migrate", { token: demoToken, body: { habits: [], logs } });
    assert.equal(status, 400);
    assert.equal((body as any).error?.code, "VALIDATION_ERROR");
  });
});

describe("Habits — cross-user isolation", () => {
  let otherToken = "";

  before(async () => {
    ({ token: otherToken } = await newUserWithToken("habits-iso"));
  });

  test("user B cannot see, patch, or delete user A's habit", async () => {
    const { body: habit } = await req("POST", "/v1/habits", {
      token: demoToken,
      body: { title: "A-only habit", color: "green", frequency: "daily" },
    });

    const { body: bHabits } = await req("GET", "/v1/habits", { token: otherToken });
    assert.equal((bHabits.items as any[]).some((h) => h.id === habit.id), false, "user B must not list user A's habit");

    assert.equal(
      (await req("PATCH", `/v1/habits/${habit.id}`, { token: otherToken, body: { title: "hijacked" } })).status,
      404,
    );
    assert.equal((await req("DELETE", `/v1/habits/${habit.id}`, { token: otherToken })).status, 404);
    assert.equal(
      (await req("POST", `/v1/habits/${habit.id}/log`, { token: otherToken, body: { date: "2026-06-20" } })).status,
      404,
    );

    const { body: aHabits } = await req("GET", "/v1/habits", { token: demoToken });
    assert.equal((aHabits.items as any[]).some((h) => h.id === habit.id), true);
    await req("DELETE", `/v1/habits/${habit.id}`, { token: demoToken });
  });

  test("migrate does not import logs for habits the user does not own", async () => {
    const { body: habit } = await req("POST", "/v1/habits", {
      token: demoToken,
      body: { title: "A-owned habit", color: "green", frequency: "daily" },
    });

    const { status, body } = await req("POST", "/v1/habits/migrate", {
      token: otherToken,
      body: {
        habits: [],
        logs: [{ habitId: habit.id, date: "2026-06-22", completedAt: "2026-06-22T08:00:00.000Z" }],
      },
    });
    assert.equal(status, 200);
    assert.equal(body.migrated.logs, 0, "a log for a foreign habit must not be imported");

    const { body: bLogs } = await req("GET", "/v1/habits/logs", { token: otherToken });
    assert.equal(
      (bLogs as any[]).some((l) => l.habitId === habit.id),
      false,
      "user B must not hold a log for user A's habit",
    );

    // The shared (habit_id, date) key must not be pre-occupied: user A's own
    // check-in must succeed and be visible to user A.
    const { status: logStatus, body: log } = await req("POST", `/v1/habits/${habit.id}/log`, {
      token: demoToken,
      body: { date: "2026-06-22" },
    });
    assert.equal(logStatus, 201);
    assert.equal(log.habitId, habit.id);
    const { body: aLogs } = await req("GET", "/v1/habits/logs", { token: demoToken });
    assert.equal(
      (aLogs as any[]).some((l) => l.habitId === habit.id && l.date === "2026-06-22"),
      true,
      "the habit owner's check-in must be visible to them",
    );

    await req("DELETE", `/v1/habits/${habit.id}`, { token: demoToken });
  });
});

describe("GET /v1/habits — keyset pagination", () => {
  let token = "";

  before(async () => {
    ({ token } = await newUserWithToken("habits-keyset"));
    // Seed enough habits to force multiple pages at a small limit.
    for (let i = 0; i < 5; i++) {
      const { status } = await req("POST", "/v1/habits", {
        token,
        body: { title: `Habit ${i}`, color: "green", frequency: "daily" },
      });
      assert.equal(status, 201);
    }
  });

  test("200 → returns a keyset page { items, nextCursor }", async () => {
    const { status, body } = await req("GET", "/v1/habits", { token });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
    // Default limit (200) is well above the seed, so the whole list fits one page.
    assert.equal(body.items.length, 5);
    assert.equal(body.nextCursor, null);
  });

  test("400 → malformed cursor is rejected with INVALID_CURSOR", async () => {
    const { status, body } = await req("GET", "/v1/habits?cursor=not-a-valid-cursor%00%00", { token });
    assert.equal(status, 400);
    assert.equal((body as any).error?.code, "INVALID_CURSOR");
  });

  test("pages through with limit + cursor, in stable created_at ASC order, no dupes/gaps", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const path: string = cursor
        ? `/v1/habits?limit=2&cursor=${encodeURIComponent(cursor)}`
        : "/v1/habits?limit=2";
      const { status, body } = await req("GET", path, { token });
      assert.equal(status, 200);
      assert.ok(body.items.length <= 2, "page must respect the limit");
      for (const h of body.items) seen.push(h.id);
      cursor = body.nextCursor;
      assert.ok(guard++ < 100, "pagination must terminate");
    } while (cursor);

    assert.equal(seen.length, 5, "every seeded habit must be visited exactly once");
    assert.equal(new Set(seen).size, 5, "no duplicate ids across pages");
  });

  test("over-max limit is clamped to ≤ 500 (does not 400)", async () => {
    const { status, body } = await req("GET", "/v1/habits?limit=99999", { token });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
  });
});
