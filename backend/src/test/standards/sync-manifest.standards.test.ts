/**
 * Standards · Sync manifest four-tuple guard (AC2).
 *
 * The generic sync engine assumes every registered entity carries the uniform
 * four-tuple { id, user_id, updated_at, deleted_at }. This guard introspects
 * each manifest table via `PRAGMA table_info` after migrations and FAILS the
 * build if any entity is missing one of the four — so "register an entity and it
 * just syncs" is enforced structurally, not promised in a comment.
 *
 * It also checks the declared `columns` list is a subset of the real table
 * schema, so a typo'd column name can't slip into the engine's SELECT/INSERT.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { runMigrations } from "../../db/migrate.js";
import { query } from "../../db/client.js";
import { SYNC_MANIFEST, FOUR_TUPLE } from "../../sync/manifest.js";

before(runMigrations);

describe("Standards · sync manifest four-tuple", () => {
  for (const entity of SYNC_MANIFEST) {
    test(`${entity.table} has the four-tuple {id, user_id, updated_at, deleted_at}`, async () => {
      const cols = await query<{ name: string }>(`PRAGMA table_info(${entity.table})`);
      const names = new Set(cols.map((c) => c.name));
      for (const required of FOUR_TUPLE) {
        assert.ok(
          names.has(required),
          `manifest entity '${entity.table}' is missing required four-tuple column '${required}'`,
        );
      }
    });

    test(`${entity.table} declared columns all exist in the real table`, async () => {
      const cols = await query<{ name: string }>(`PRAGMA table_info(${entity.table})`);
      const names = new Set(cols.map((c) => c.name));
      for (const declared of entity.columns) {
        assert.ok(
          names.has(declared),
          `manifest entity '${entity.table}' declares column '${declared}' which is not in the table`,
        );
      }
    });
  }

  test("every manifest entity declares the four-tuple in its columns list", () => {
    for (const entity of SYNC_MANIFEST) {
      for (const required of FOUR_TUPLE) {
        assert.ok(
          entity.columns.includes(required),
          `manifest entity '${entity.table}' columns list omits '${required}'`,
        );
      }
    }
  });
});
