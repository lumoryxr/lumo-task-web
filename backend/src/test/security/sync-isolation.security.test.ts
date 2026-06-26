/**
 * Security · Sync cross-user isolation (AC1 + AC7).
 *
 * The sync API is the single audited chokepoint enforcing per-user isolation on
 * a shared multi-tenant DB. `user_id` comes ONLY from the verified JWT. This
 * suite proves the wire-level guarantees:
 *
 *   AC1 — A's pull returns ZERO of B's rows, for every entity.
 *       — A pushing rows stamped with B's user_id persists them UNDER A and
 *         leaves B's data untouched.
 *       — A pushing a row whose id == an existing B-owned row does NOT modify
 *         B's row (it is rejected; B's row is unchanged).
 *   AC7 — pull/push without a JWT return 401; no request field overrides identity.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb } from "../helpers/index.js";
import { newUserWithToken, type AuthedUser } from "../helpers/auth.js";
import { now } from "../../lib/hlc.js";

let A: AuthedUser;
let B: AuthedUser;

function taskRow(id: string, titleEn: string, updatedAt: string, userId: string) {
  return {
    id, user_id: userId, title_en: titleEn, updated_at: updatedAt,
    assignee_ids: "[]", not_now_json: "[]", subtasks_json: "[]", quadrant: "unclassified",
    today: 0, duration: 0, pomos_done: 0, pomos_total: 0, completed: 0,
    recurrence: "none", week_focus: 0, created_at: updatedAt,
  };
}
function personRow(id: string, name: string, updatedAt: string, userId: string) {
  return {
    id, user_id: userId, name, initials: name.slice(0, 2), color: "#00ff00",
    created_at: updatedAt, updated_at: updatedAt,
  };
}

async function pullAs(token: string, since?: string) {
  return req("POST", "/v1/sync/pull", { token, body: since ? { since } : {} });
}
async function pushAs(token: string, entities: Record<string, unknown[]>) {
  return req("POST", "/v1/sync/push", { token, body: { entities } });
}

before(async () => {
  await setupDb();
  A = await newUserWithToken("sync-A");
  B = await newUserWithToken("sync-B");
});

describe("AC7 · auth required; identity from JWT only", () => {
  test("pull without a token → 401", async () => {
    const { status } = await req("POST", "/v1/sync/pull", { body: {} });
    assert.equal(status, 401);
  });
  test("push without a token → 401", async () => {
    const { status } = await req("POST", "/v1/sync/push", { body: { entities: {} } });
    assert.equal(status, 401);
  });
});

describe("AC1 · cross-user isolation", () => {
  test("A's pull returns ZERO of B's rows for every entity", async () => {
    const t = now();
    // B writes its own rows.
    await pushAs(B.token, {
      tasks: [taskRow("B-task", "B secret", t, B.userId)],
      people: [personRow("B-person", "Bob", t, B.userId)],
    });

    // A pulls — must see none of B's rows in any entity.
    const { status, body } = await pullAs(A.token);
    assert.equal(status, 200);
    for (const tbl of Object.keys(body.entities)) {
      const fromB = body.entities[tbl].filter((r: any) => r.id === "B-task" || r.id === "B-person");
      assert.equal(fromB.length, 0, `A leaked a B row in ${tbl}`);
      // And no row A pulls is owned by B.
      for (const r of body.entities[tbl]) {
        assert.notEqual(r.user_id, B.userId, `A pulled a row owned by B in ${tbl}`);
      }
    }
  });

  test("A pushing rows stamped with B's user_id persists them UNDER A", async () => {
    const t = now();
    // A pushes a row claiming to be B's.
    const r = await pushAs(A.token, {
      tasks: [taskRow("A-claims-B", "spoof", t, B.userId)],
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.applied, 1);

    // A can pull it (it's under A).
    const aPull = await pullAs(A.token);
    const aRow = aPull.body.entities.tasks.find((x: any) => x.id === "A-claims-B");
    assert.ok(aRow, "A should own the spoofed row");
    assert.equal(aRow.user_id, A.userId, "server forced user_id to A");

    // B never sees it.
    const bPull = await pullAs(B.token);
    const bRow = bPull.body.entities.tasks.find((x: any) => x.id === "A-claims-B");
    assert.equal(bRow, undefined, "B must not receive A's spoofed row");
  });

  test("A pushing a row whose id == a B-owned row does NOT modify B's row", async () => {
    const tB = now();
    // B creates a row.
    await pushAs(B.token, { tasks: [taskRow("shared-id", "B original", tB, B.userId)] });

    // A pushes a row with the SAME id and a LATER HLC, claiming B's user_id.
    const tA = now(); // tA > tB
    const r = await pushAs(A.token, { tasks: [taskRow("shared-id", "A overwrite attempt", tA, B.userId)] });
    assert.equal(r.status, 200);
    // The write either creates A's own row (different owner) or is a no-op vs B;
    // in NO case may B's row be modified.

    // B's row must be unchanged.
    const bPull = await pullAs(B.token);
    const bRow = bPull.body.entities.tasks.find((x: any) => x.id === "shared-id");
    assert.ok(bRow, "B's row must still exist");
    assert.equal(bRow.user_id, B.userId, "B's row still owned by B");
    assert.equal(bRow.title_en, "B original", "B's row content must be untouched by A");
  });
});
