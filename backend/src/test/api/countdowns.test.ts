/**
 * API · Countdowns
 *   GET / · POST · PATCH /:id · DELETE /:id · POST /migrate
 * Plus cross-user isolation for countdowns.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo, newUserWithToken } from "../helpers/index.js";

let demoToken = "";

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
});

describe("Countdowns", () => {
  let eventId = "";

  test("401 → unauthenticated GET /v1/countdowns", async () => {
    const { status } = await req("GET", "/v1/countdowns");
    assert.equal(status, 401);
  });

  test("201 → POST creates a countdown event", async () => {
    const { status, body } = await req("POST", "/v1/countdowns", {
      token: demoToken,
      body: { title: "Launch day", date: "2026-12-01", color: "cyan", repeat: "yearly", emoji: "🚀" },
    });
    assert.equal(status, 201);
    assert.ok(body.id);
    assert.equal(body.title, "Launch day");
    assert.equal(body.repeat, "yearly");
    eventId = body.id;
  });

  test("400 → POST rejects a malformed date", async () => {
    const { status } = await req("POST", "/v1/countdowns", {
      token: demoToken,
      body: { title: "Bad date", date: "2026/12/01", color: "green", repeat: "none" },
    });
    assert.equal(status, 400);
  });

  test("400 → POST rejects an invalid repeat value", async () => {
    const { status } = await req("POST", "/v1/countdowns", {
      token: demoToken,
      body: { title: "Bad repeat", date: "2026-12-01", color: "green", repeat: "weekly" },
    });
    assert.equal(status, 400);
  });

  test("201 → POST defaults calendar to 'solar' when omitted", async () => {
    const { status, body } = await req("POST", "/v1/countdowns", {
      token: demoToken,
      body: { title: "No calendar", date: "2026-12-01", color: "green", repeat: "none" },
    });
    assert.equal(status, 201);
    assert.equal(body.calendar, "solar");
  });

  test("201 → POST persists a lunar countdown and round-trips it via GET", async () => {
    const { status, body } = await req("POST", "/v1/countdowns", {
      token: demoToken,
      body: { title: "农历生日", date: "2026-06-15", color: "amber", repeat: "yearly", calendar: "lunar" },
    });
    assert.equal(status, 201);
    assert.equal(body.calendar, "lunar");
    const list = await req("GET", "/v1/countdowns", { token: demoToken });
    const found = (list.body as any[]).find((e) => e.id === body.id);
    assert.equal(found.calendar, "lunar");
  });

  test("400 → POST rejects an invalid calendar value", async () => {
    const { status } = await req("POST", "/v1/countdowns", {
      token: demoToken,
      body: { title: "Bad cal", date: "2026-12-01", color: "green", repeat: "none", calendar: "julian" },
    });
    assert.equal(status, 400);
  });

  test("200 → PATCH updates the calendar field", async () => {
    const created = await req("POST", "/v1/countdowns", {
      token: demoToken,
      body: { title: "Switch me", date: "2026-12-01", color: "green", repeat: "yearly" },
    });
    const { status, body } = await req("PATCH", `/v1/countdowns/${created.body.id}`, {
      token: demoToken,
      body: { calendar: "lunar" },
    });
    assert.equal(status, 200);
    assert.equal(body.calendar, "lunar");
  });

  test("200 → PATCH updates date and clears note when sent as null", async () => {
    await req("PATCH", `/v1/countdowns/${eventId}`, { token: demoToken, body: { note: "remember" } });
    const { status, body } = await req("PATCH", `/v1/countdowns/${eventId}`, {
      token: demoToken,
      body: { date: "2026-11-15", note: null },
    });
    assert.equal(status, 200);
    assert.equal(body.date, "2026-11-15");
    assert.equal(body.note ?? null, null, "note should be cleared");
    assert.equal(body.title, "Launch day", "untouched fields should be preserved");
  });

  test("404 → PATCH on a non-existent event", async () => {
    const { status } = await req("PATCH", "/v1/countdowns/cd_missing", {
      token: demoToken,
      body: { title: "Nope" },
    });
    assert.equal(status, 404);
  });

  test("204 → DELETE removes the event", async () => {
    const { status } = await req("DELETE", `/v1/countdowns/${eventId}`, { token: demoToken });
    assert.equal(status, 204);
    const { body } = await req("GET", "/v1/countdowns", { token: demoToken });
    assert.equal((body as any[]).some((e) => e.id === eventId), false);
  });

  test("404 → DELETE on an already-removed event", async () => {
    const { status } = await req("DELETE", `/v1/countdowns/${eventId}`, { token: demoToken });
    assert.equal(status, 404);
  });

  test("POST /migrate is idempotent — re-running keeps a single row per id", async () => {
    const payload = {
      events: [
        {
          id: "cd_migrate_1",
          title: "Imported event",
          date: "2026-09-09",
          color: "red",
          repeat: "none",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    assert.equal((await req("POST", "/v1/countdowns/migrate", { token: demoToken, body: payload })).status, 200);
    assert.equal((await req("POST", "/v1/countdowns/migrate", { token: demoToken, body: payload })).status, 200);

    const { body } = await req("GET", "/v1/countdowns", { token: demoToken });
    assert.equal((body as any[]).filter((e) => e.id === "cd_migrate_1").length, 1);
  });
});

describe("Countdowns — cross-user isolation", () => {
  let otherToken = "";

  before(async () => {
    ({ token: otherToken } = await newUserWithToken("cd-iso"));
  });

  test("user B cannot see, patch, or delete user A's countdown", async () => {
    const { body: event } = await req("POST", "/v1/countdowns", {
      token: demoToken,
      body: { title: "A-only event", date: "2026-12-31", color: "green", repeat: "none" },
    });

    const { body: bEvents } = await req("GET", "/v1/countdowns", { token: otherToken });
    assert.equal((bEvents as any[]).some((e) => e.id === event.id), false);

    assert.equal(
      (await req("PATCH", `/v1/countdowns/${event.id}`, { token: otherToken, body: { title: "hijacked" } })).status,
      404,
    );
    assert.equal((await req("DELETE", `/v1/countdowns/${event.id}`, { token: otherToken })).status, 404);

    const { body: aEvents } = await req("GET", "/v1/countdowns", { token: demoToken });
    assert.equal((aEvents as any[]).some((e) => e.id === event.id), true);
    await req("DELETE", `/v1/countdowns/${event.id}`, { token: demoToken });
  });
});
