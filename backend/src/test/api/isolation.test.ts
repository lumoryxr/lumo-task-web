/**
 * API · Cross-user data isolation (tasks / people / settings)
 *
 * Row-level ownership: user B must never read, modify, or delete user A's data,
 * and never see it in a list. (Habit/countdown isolation lives with their own
 * domains; the systematic IDOR sweep lands in test/security/ in a later phase.)
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo, newUserWithToken } from "../helpers/index.js";

let demoToken = "";
let userBToken = "";

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
  ({ token: userBToken } = await newUserWithToken("userb"));
});

describe("Cross-user data isolation", () => {
  test("user B cannot read user A's tasks via GET /v1/tasks/:id", async () => {
    const { body: task } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "User A secret task" } },
    });

    const { status } = await req("GET", `/v1/tasks/${task.id}`, { token: userBToken });
    assert.equal(status, 404, "user B should not be able to read user A's task");

    await req("DELETE", `/v1/tasks/${task.id}`, { token: demoToken });
  });

  test("user B cannot modify user A's tasks via PATCH /v1/tasks/:id", async () => {
    const { body: task } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "User A task to patch" } },
    });

    const { status } = await req("PATCH", `/v1/tasks/${task.id}`, {
      token: userBToken,
      body: { quadrant: "Q4" },
    });
    assert.equal(status, 404);

    const { body: original } = await req("GET", `/v1/tasks/${task.id}`, { token: demoToken });
    assert.equal(original.quadrant, "unclassified", "task should be unchanged");

    await req("DELETE", `/v1/tasks/${task.id}`, { token: demoToken });
  });

  test("user B cannot delete user A's tasks via DELETE /v1/tasks/:id", async () => {
    const { body: task } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "User A task to delete" } },
    });

    const { status } = await req("DELETE", `/v1/tasks/${task.id}`, { token: userBToken });
    assert.equal(status, 404);

    const { status: s } = await req("GET", `/v1/tasks/${task.id}`, { token: demoToken });
    assert.equal(s, 200, "user A's task should still exist");

    await req("DELETE", `/v1/tasks/${task.id}`, { token: demoToken });
  });

  test("user B sees only their own task list", async () => {
    await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "User A private" } },
    });

    await req("POST", "/v1/tasks", {
      token: userBToken,
      body: { title: { en: "User B own task" } },
    });

    const { body: bTasks } = await req("GET", "/v1/tasks", { token: userBToken });
    assert.ok(Array.isArray(bTasks.items));
    const hasUserATask = (bTasks.items as any[]).some((t: any) => t.title.en === "User A private");
    assert.equal(hasUserATask, false, "user B should not see user A's tasks");
  });

  test("user B cannot access user A's people", async () => {
    const { body: person } = await req("POST", "/v1/people", {
      token: demoToken,
      body: { name: "User A Contact", initials: "AC", color: "#ff6b6b" },
    });

    const { status } = await req("DELETE", `/v1/people/${person.id}`, { token: userBToken });
    assert.equal(status, 404);

    const { body: people } = await req("GET", "/v1/people", { token: demoToken });
    const found = (people as any[]).find((p: any) => p.id === person.id);
    assert.ok(found, "person should still exist for user A");

    await req("DELETE", `/v1/people/${person.id}`, { token: demoToken });
  });

  test("user B's settings are independent from user A's", async () => {
    await req("PATCH", "/v1/settings", { token: demoToken, body: { locale: "zh" } });

    const { body: bSettings } = await req("GET", "/v1/settings", { token: userBToken });
    assert.equal(bSettings.locale, "en", "user B's locale should be independent");

    await req("PATCH", "/v1/settings", { token: demoToken, body: { locale: "en" } });
  });
});
