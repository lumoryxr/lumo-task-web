/**
 * API · Calendar feed (#169 V1 — read-only ICS)
 *   GET /v1/calendar/feed          (authed — get/create the secret URL)
 *   POST /v1/calendar/feed/rotate  (authed — revoke + reissue)
 *   GET /v1/calendar/feed.ics?token=…  (public — the subscribable feed)
 * Plus token gating and cross-user isolation.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo, newUserWithToken } from "../helpers/index.js";
import { app } from "../../app.js";

/** Fetch the raw .ics text (req() would try JSON first). */
async function fetchFeed(token: string | null): Promise<{ status: number; ctype: string | null; text: string }> {
  const path = token === null ? "/v1/calendar/feed.ics" : `/v1/calendar/feed.ics?token=${encodeURIComponent(token)}`;
  const res = await app.request(path, { method: "GET" });
  return { status: res.status, ctype: res.headers.get("content-type"), text: await res.text() };
}

let demoToken = "";

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
});

describe("Calendar feed", () => {
  let feedToken = "";

  test("401 → unauthenticated GET /v1/calendar/feed", async () => {
    const { status } = await req("GET", "/v1/calendar/feed");
    assert.equal(status, 401);
  });

  test("200 → authed GET /feed returns a stable token + url", async () => {
    const { status, body } = await req("GET", "/v1/calendar/feed", { token: demoToken });
    assert.equal(status, 200);
    assert.ok(body.token && typeof body.token === "string");
    assert.match(body.url, /\/v1\/calendar\/feed\.ics\?token=/);
    feedToken = body.token;

    // Idempotent: a second call returns the same token (stable subscription URL).
    const again = await req("GET", "/v1/calendar/feed", { token: demoToken });
    assert.equal(again.body.token, feedToken);
  });

  test("200 → public feed carries the user's due tasks + countdowns as VEVENTs", async () => {
    await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Feed me, Seymour" }, due: "2026-07-20" },
    });
    await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "No due date task" } }, // excluded — no due
    });
    await req("POST", "/v1/countdowns", {
      token: demoToken,
      body: { title: "Launch", date: "2026-12-01", color: "cyan", repeat: "none", emoji: "🚀" },
    });

    const { status, ctype, text } = await fetchFeed(feedToken);
    assert.equal(status, 200);
    assert.match(ctype ?? "", /text\/calendar/);
    assert.ok(text.includes("BEGIN:VCALENDAR"));
    assert.ok(text.includes("SUMMARY:Feed me\\, Seymour"), "due task present + escaped");
    assert.ok(text.includes("DTSTART;VALUE=DATE:20260720"));
    assert.ok(text.includes("SUMMARY:Launch"), "countdown present");
    assert.ok(text.includes("DTSTART;VALUE=DATE:20261201"));
    assert.ok(!text.includes("No due date task"), "task without a due date is excluded");
  });

  test("404 → public feed with a missing or unknown token (no token confirmation)", async () => {
    assert.equal((await fetchFeed(null)).status, 404);
    assert.equal((await fetchFeed("definitely-not-a-real-token")).status, 404);
  });

  test("rotate → new token works, old token is revoked (404)", async () => {
    const { status, body } = await req("POST", "/v1/calendar/feed/rotate", { token: demoToken });
    assert.equal(status, 200);
    assert.ok(body.token && body.token !== feedToken);
    const rotated = body.token;

    assert.equal((await fetchFeed(feedToken)).status, 404, "old token no longer resolves");
    assert.equal((await fetchFeed(rotated)).status, 200, "new token resolves");
    feedToken = rotated;
  });

  test("isolation → one user's feed never contains another user's tasks", async () => {
    const alice = await newUserWithToken("alice");
    await req("POST", "/v1/tasks", {
      token: alice.token,
      body: { title: { en: "ALICE_SECRET_TASK" }, due: "2026-08-01" },
    });
    const aliceFeed = await req("GET", "/v1/calendar/feed", { token: alice.token });

    // Bob (demo) fetches his own feed — must not see Alice's task.
    const demoFeed = await fetchFeed(feedToken);
    assert.ok(!demoFeed.text.includes("ALICE_SECRET_TASK"));

    // Alice's own feed does contain it (positive control — emptiness would be a false pass).
    const aliceIcs = await fetchFeed(aliceFeed.body.token);
    assert.ok(aliceIcs.text.includes("ALICE_SECRET_TASK"));
  });
});
