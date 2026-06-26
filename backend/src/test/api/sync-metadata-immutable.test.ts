/**
 * Sync metadata is server-owned.
 *
 * `deleted_at`, `updated_at`, `created_at` are stamped by the server only. A
 * client that smuggles them into a write body must have them ignored —
 * otherwise it could backdate `updated_at` to hide from delta sync, forward-date
 * it to always win LWW, or pre-set `deleted_at` to tombstone a row on creation.
 * Zod strips unknown keys, but this locks the behaviour in.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";
import { queryOne } from "../../db/client.js";

let token = "";

before(async () => {
  await setupDb();
  ({ token } = await newUserWithToken("meta"));
});

describe("Clients cannot set sync metadata", () => {
  test("POST /tasks ignores client-supplied deleted_at / updated_at / created_at", async () => {
    const { status, body } = await req("POST", "/v1/tasks", {
      token,
      body: {
        title: { en: "legit" },
        quadrant: "Q1",
        deleted_at: "2020-01-01T00:00:00.000Z",
        updated_at: "2000-01-01T00:00:00.000Z",
        created_at: "1999-01-01T00:00:00.000Z",
      } as any,
    });
    assert.equal(status, 201);

    const row = await queryOne<{ deleted_at: string | null; updated_at: string; created_at: string }>(
      "SELECT deleted_at, updated_at, created_at FROM tasks WHERE id = :id",
      { id: body.id },
    );
    assert.equal(row!.deleted_at, null, "client deleted_at must be ignored (task must be live)");
    assert.notEqual(row!.updated_at, "2000-01-01T00:00:00.000Z", "client updated_at must be ignored");
    assert.notEqual(row!.created_at, "1999-01-01T00:00:00.000Z", "client created_at must be ignored");

    // And the task is live + visible (not tombstoned on creation).
    const list = await req("GET", "/v1/tasks", { token });
    assert.ok(list.body.items.some((x: any) => x.id === body.id), "task must be visible");
  });

  test("PATCH /tasks ignores a client-supplied deleted_at (cannot tombstone via update)", async () => {
    const { body: t } = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "patch target" }, quadrant: "Q2" },
    });
    const patch = await req("PATCH", `/v1/tasks/${t.id}`, {
      token,
      body: { title: { en: "renamed" }, deleted_at: "2020-01-01T00:00:00.000Z" } as any,
    });
    assert.equal(patch.status, 200);
    const row = await queryOne<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM tasks WHERE id = :id",
      { id: t.id },
    );
    assert.equal(row!.deleted_at, null, "PATCH must not let a client tombstone a row");
    assert.equal((await req("GET", `/v1/tasks/${t.id}`, { token })).status, 200);
  });

  // Every create endpoint must server-own deleted_at / created_at, regardless of body.
  const META = { deleted_at: "2020-01-01T00:00:00.000Z", created_at: "1999-01-01T00:00:00.000Z" };
  const CREATES: { ep: string; table: string; body: Record<string, unknown> }[] = [
    { ep: "/v1/people", table: "people", body: { name: "N", initials: "NN", color: "#5bc8d4", ...META } },
    { ep: "/v1/habits", table: "habits", body: { title: "H", color: "green", frequency: "daily", ...META } },
    { ep: "/v1/countdowns", table: "countdown_events", body: { title: "C", date: "2026-12-01", color: "cyan", repeat: "none", ...META } },
  ];
  for (const { ep, table, body } of CREATES) {
    test(`POST ${ep} ignores client deleted_at/created_at (server-owned)`, async () => {
      const { status, body: created } = await req("POST", ep, { token, body: body as any });
      assert.equal(status, 201);
      const row = await queryOne<{ deleted_at: string | null; created_at: string }>(
        `SELECT deleted_at, created_at FROM ${table} WHERE id = :id`,
        { id: created.id },
      );
      assert.equal(row!.deleted_at, null, `${ep}: client deleted_at must be ignored`);
      assert.notEqual(row!.created_at, "1999-01-01T00:00:00.000Z", `${ep}: client created_at must be ignored`);
    });
  }
});
