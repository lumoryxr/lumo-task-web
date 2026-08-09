/**
 * Unit · atomic Lumo Cloud usage metering (routes/ai · incrementCloudUsage)
 *
 * The old increment was a read-modify-write (SELECT used → UPDATE used+1) that
 * two concurrent requests could race, undercounting and letting a user slip
 * past the free limit — a revenue-integrity bug. It is now a single atomic SQL
 * statement per counter (per-user with month rollover, plus a global counter).
 * These tests pin the metering behavior.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { setupDb, newUserWithToken } from "../helpers/index.js";
import { query, queryOne, execute } from "../../db/client.js";
import { incrementCloudUsage } from "../../routes/ai.js";

const thisMonth = () => new Date().toISOString().slice(0, 7);

before(async () => {
  await setupDb();
});

async function userUsage(uid: string) {
  return queryOne<{ ai_cloud_used: number; ai_cloud_month: string }>(
    "SELECT ai_cloud_used, ai_cloud_month FROM settings WHERE user_id = :uid",
    { uid },
  );
}
async function globalUsage(month: string): Promise<number> {
  const g = await queryOne<{ used: number }>(
    "SELECT used FROM ai_cloud_global WHERE month = :m",
    { m: month },
  );
  return g?.used ?? 0;
}

describe("incrementCloudUsage", () => {
  test("bumps the per-user counter and stamps the current month", async () => {
    const { userId } = await newUserWithToken("clouduse");
    await incrementCloudUsage(userId);
    await incrementCloudUsage(userId);
    const u = await userUsage(userId);
    assert.equal(u?.ai_cloud_used, 2);
    assert.equal(u?.ai_cloud_month, thisMonth());
  });

  test("rolls the per-user counter over when the stored month is stale", async () => {
    const { userId } = await newUserWithToken("cloudroll");
    await execute(
      "UPDATE settings SET ai_cloud_used = 5, ai_cloud_month = '2000-01' WHERE user_id = :uid",
      { uid: userId },
    );
    await incrementCloudUsage(userId);
    const u = await userUsage(userId);
    assert.equal(u?.ai_cloud_used, 1, "stale month resets to 1, not 6");
    assert.equal(u?.ai_cloud_month, thisMonth());
  });

  test("increments the global monthly counter by exactly the number of calls", async () => {
    const month = thisMonth();
    const before = await globalUsage(month);
    const { userId } = await newUserWithToken("cloudglobal");
    await incrementCloudUsage(userId);
    await incrementCloudUsage(userId);
    await incrementCloudUsage(userId);
    assert.equal(await globalUsage(month) - before, 3);
  });

  test("the ai_cloud_global row exists after migrations", async () => {
    const rows = await query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_cloud_global'",
    );
    assert.equal(rows.length, 1);
  });
});
