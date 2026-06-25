/**
 * API · GET /v1/tasks keyset pagination  (PRD #47, ADR-0001)
 *
 * AC-1 limit caps page size · AC-2 cursor pages don't overlap/gap · AC-3 stable
 * order · AC-4 default cap applied · AC-5 invalid limit/cursor → 400 · AC-6 q
 * composes · AC-7 tenant isolation.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo, newUserWithToken, seedTask } from "../helpers/index.js";
import { query } from "../../db/client.js";

let token = "";
const ids: string[] = [];

before(async () => {
  await setupDb();
  ({ token } = await signInDemo());
  // 5 incomplete tasks for the primary user
  for (let i = 0; i < 5; i++) {
    const t = await seedTask(token, { title: { en: `Task ${i}`, zh: `任务 ${i}` } });
    ids.push(t.id);
  }
});

/** Walk every page via cursor, return the flat list of item ids. */
async function pageThrough(limit: number, query = ""): Promise<string[]> {
  const collected: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 100; guard++) {
    const qs = `limit=${limit}${query ? `&${query}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const { status, body } = await req("GET", `/v1/tasks?${qs}`, { token });
    assert.equal(status, 200, `page fetch failed: ${JSON.stringify(body)}`);
    assert.ok(Array.isArray(body.items), "response must be an envelope with items[]");
    assert.ok(body.items.length <= limit, `AC-1: page exceeded limit (${body.items.length} > ${limit})`);
    collected.push(...body.items.map((t: any) => t.id));
    if (body.nextCursor == null) return collected;
    cursor = body.nextCursor;
  }
  throw new Error("pagination did not terminate");
}

describe("GET /v1/tasks · pagination", () => {
  test("AC-1/AC-2/AC-3: cursor pages cover all rows once, in stable order", async () => {
    const all = await pageThrough(2);
    assert.equal(all.length, 5, "every row returned exactly once");
    assert.equal(new Set(all).size, 5, "no duplicates across pages");
    // stable order: a second full walk yields the identical sequence
    assert.deepEqual(await pageThrough(2), all);
  });

  test("AC-2: last page reports nextCursor=null", async () => {
    const { body } = await req("GET", "/v1/tasks?limit=50", { token });
    assert.equal(body.items.length, 5);
    assert.equal(body.nextCursor, null);
  });

  test("AC-4: response is the bounded envelope even with no limit param", async () => {
    const { status, body } = await req("GET", "/v1/tasks", { token });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items) && "nextCursor" in body, "must be {items,nextCursor}");
    assert.ok(body.items.length <= 50, "default cap applied");
  });

  test("AC-5: invalid limit and cursor are rejected with 400", async () => {
    assert.equal((await req("GET", "/v1/tasks?limit=0", { token })).status, 400);
    assert.equal((await req("GET", "/v1/tasks?limit=999", { token })).status, 400);
    assert.equal((await req("GET", "/v1/tasks?limit=abc", { token })).status, 400);
    assert.equal((await req("GET", "/v1/tasks?cursor=%%%notvalid%%%", { token })).status, 400);
  });

  test("AC-6: q search composes with pagination", async () => {
    const r1 = await req("GET", "/v1/tasks?q=Task&limit=2", { token });
    assert.equal(r1.status, 200);
    assert.ok(r1.body.items.length <= 2);
    // walking q-filtered pages returns all 5 matching tasks once
    const all = await pageThrough(2, "q=Task");
    assert.equal(all.length, 5);
    assert.equal(new Set(all).size, 5);
  });

  test("AC-3: pages don't drop/repeat rows that share an identical created_at", async () => {
    // Force a tie: a fresh user whose tasks are stamped the same created_at, then
    // page with limit=1 across the tie. id is the only tiebreak.
    const u = await newUserWithToken("pg-ties");
    const tie: string[] = [];
    for (let i = 0; i < 4; i++) tie.push((await seedTask(u.token, {})).id);
    await import("../../db/client.js").then(({ execute }) =>
      execute("UPDATE tasks SET created_at = '2026-06-24T00:00:00.000Z' WHERE user_id = :uid", { uid: u.userId }),
    );

    const walked: string[] = [];
    let cursor: string | null = null;
    for (let g = 0; g < 50; g++) {
      const qs: string = `limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const { body } = await req("GET", `/v1/tasks?${qs}`, { token: u.token });
      walked.push(...body.items.map((t: any) => t.id));
      if (body.nextCursor == null) break;
      cursor = body.nextCursor;
    }
    assert.equal(walked.length, 4, "all tied rows returned");
    assert.equal(new Set(walked).size, 4, "no duplicates across the tie boundary");
    for (const id of tie) assert.ok(walked.includes(id), `tied row ${id} skipped`);
  });

  test("AC-8: the keyset page query is index-backed (no full scan)", async () => {
    const plan = await query<{ detail: string }>(
      `EXPLAIN QUERY PLAN SELECT * FROM tasks
         WHERE user_id = 'u' AND completed = 0 AND deleted_at IS NULL
           AND (created_at > '2026-01-01' OR (created_at = '2026-01-01' AND id > 'x'))
         ORDER BY created_at ASC, id ASC LIMIT 51`,
    );
    const text = plan.map((r) => r.detail).join(" | ");
    assert.match(text, /USING INDEX idx_tasks_user_completed_created/i, `plan was: ${text}`);
    assert.doesNotMatch(text, /SCAN tasks(?! USING)/i, `unexpected full scan: ${text}`);
  });

  test("AC-7: a cursor never leaks another tenant's rows", async () => {
    // primary user's cursor from page 1
    const p1 = await req("GET", "/v1/tasks?limit=2", { token });
    const foreignCursor = p1.body.nextCursor as string;
    assert.ok(foreignCursor, "expected a next cursor");

    // a fresh user with their own tasks uses the primary user's cursor
    const other = await newUserWithToken("pg-other");
    const own: string[] = [];
    for (let i = 0; i < 3; i++) own.push((await seedTask(other.token, {})).id);

    const { status, body } = await req("GET", `/v1/tasks?limit=50&cursor=${encodeURIComponent(foreignCursor)}`, { token: other.token });
    assert.equal(status, 200);
    const returned = body.items.map((t: any) => t.id);
    // only the other user's own rows may appear; never the primary user's
    for (const id of returned) assert.ok(own.includes(id), `AC-7 violated: leaked id ${id}`);
    for (const id of ids) assert.ok(!returned.includes(id), `AC-7 violated: primary row ${id} visible to other tenant`);
  });
});
