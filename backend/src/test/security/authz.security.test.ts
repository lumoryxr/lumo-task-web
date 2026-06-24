/**
 * Security · Authorization (IDOR / horizontal privilege)
 *
 * Table-driven sweep across every id-addressable owned resource: user B must
 * never read, modify, delete, or list user A's rows. Adding a new owned domain
 * = one row in RESOURCES. Foreign access returns 404 (existence-hiding), and
 * the owner's data is left intact.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import {
  req,
  setupDb,
  signInDemo,
  newUserWithToken,
  seedTask,
  seedPerson,
  seedHabit,
  seedCountdown,
} from "../helpers/index.js";

type Seeder = (token: string) => Promise<any>;

interface Resource {
  name: string;
  base: string;
  seed: Seeder;
  patch: Record<string, unknown>;
  /** Whether the API exposes GET /base/:id for a single row. */
  getById: boolean;
}

const RESOURCES: Resource[] = [
  { name: "task", base: "/v1/tasks", seed: (t) => seedTask(t), patch: { quadrant: "Q4" }, getById: true },
  { name: "person", base: "/v1/people", seed: (t) => seedPerson(t), patch: { name: "hijacked" }, getById: false },
  { name: "habit", base: "/v1/habits", seed: (t) => seedHabit(t), patch: { title: "hijacked" }, getById: false },
  { name: "countdown", base: "/v1/countdowns", seed: (t) => seedCountdown(t), patch: { title: "hijacked" }, getById: false },
];

// List endpoints return either a bare array or a paginated envelope
// ({ items, nextCursor }); extract the rows regardless of shape.
function listItems(body: any): any[] {
  return Array.isArray(body) ? body : (body?.items ?? []);
}

let ownerToken = "";
let attackerToken = "";

before(async () => {
  await setupDb();
  ({ token: ownerToken } = await signInDemo());
  ({ token: attackerToken } = await newUserWithToken("attacker"));
});

for (const r of RESOURCES) {
  describe(`Security · authz · ${r.name} (IDOR)`, () => {
    let id = "";

    before(async () => {
      const created = await r.seed(ownerToken);
      id = created.id;
      assert.ok(id, `${r.name} seed did not return an id`);
    });

    if (r.getById) {
      test(`attacker GET ${r.base}/:id → 404`, async () => {
        const { status } = await req("GET", `${r.base}/${id}`, { token: attackerToken });
        assert.equal(status, 404);
      });
    }

    test(`attacker PATCH ${r.base}/:id → 404`, async () => {
      const { status } = await req("PATCH", `${r.base}/${id}`, { token: attackerToken, body: r.patch });
      assert.equal(status, 404);
    });

    test(`attacker DELETE ${r.base}/:id → 404`, async () => {
      const { status } = await req("DELETE", `${r.base}/${id}`, { token: attackerToken });
      assert.equal(status, 404);
    });

    test(`attacker list ${r.base} excludes the owner's row`, async () => {
      const { status, body } = await req("GET", r.base, { token: attackerToken });
      assert.equal(status, 200);
      const rows = listItems(body);
      assert.ok(Array.isArray(rows));
      assert.equal(rows.some((row) => row.id === id), false, "attacker must not see owner's row");
    });

    test(`owner's ${r.name} survives the attack`, async () => {
      const { body } = await req("GET", r.base, { token: ownerToken });
      assert.equal(listItems(body).some((row) => row.id === id), true, "owner's row should still exist");
    });
  });
}
