/**
 * Unit · logical backup serializers (sqlValue / rowsToInserts).
 * Pure functions — no DB needed.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { sqlValue, rowsToInserts, dumpDatabase } from "../../db/backup.js";
import { setupDb, newUserWithToken, req } from "../helpers/index.js";

describe("sqlValue", () => {
  test("null / undefined → NULL", () => {
    assert.equal(sqlValue(null), "NULL");
    assert.equal(sqlValue(undefined), "NULL");
  });

  test("finite numbers pass through; NaN/Infinity → NULL", () => {
    assert.equal(sqlValue(42), "42");
    assert.equal(sqlValue(-3.14), "-3.14");
    assert.equal(sqlValue(NaN), "NULL");
    assert.equal(sqlValue(Infinity), "NULL");
  });

  test("bigint → decimal string", () => {
    assert.equal(sqlValue(9007199254740993n), "9007199254740993");
  });

  test("boolean → 1 / 0 (SQLite has no bool)", () => {
    assert.equal(sqlValue(true), "1");
    assert.equal(sqlValue(false), "0");
  });

  test("strings are single-quoted with embedded quotes doubled (injection-safe)", () => {
    assert.equal(sqlValue("hello"), "'hello'");
    assert.equal(sqlValue("O'Brien"), "'O''Brien'");
    assert.equal(sqlValue("'; DROP TABLE users;--"), "'''; DROP TABLE users;--'");
  });

  test("Uint8Array → X'hex' blob literal", () => {
    assert.equal(sqlValue(new Uint8Array([0, 15, 255])), "X'000fff'");
  });
});

describe("rowsToInserts", () => {
  test("empty rows → no statements", () => {
    assert.deepEqual(rowsToInserts("tasks", []), []);
  });

  test("emits one quoted INSERT per row", () => {
    const stmts = rowsToInserts("tasks", [
      { id: "t1", title: "A", done: false },
      { id: "t2", title: "B'C", done: true },
    ]);
    assert.equal(stmts.length, 2);
    assert.equal(stmts[0], `INSERT INTO "tasks" ("id", "title", "done") VALUES ('t1', 'A', 0);`);
    assert.equal(stmts[1], `INSERT INTO "tasks" ("id", "title", "done") VALUES ('t2', 'B''C', 1);`);
  });

  test("quotes table and column identifiers", () => {
    const [stmt] = rowsToInserts("weird table", [{ "od d": 1 }]);
    assert.match(stmt, /^INSERT INTO "weird table" \("od d"\) VALUES \(1\);$/);
  });
});

describe("dumpDatabase (e2e against the seeded schema)", () => {
  before(async () => {
    await setupDb();
  });

  test("captures real rows and wraps them in a replayable transaction", async () => {
    // Create a real user + task through the public API so there are rows to dump.
    const { token } = await newUserWithToken("backup");
    await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "Backup me" }, quadrant: "Q2" },
    });

    const sql = await dumpDatabase();

    assert.match(sql, /BEGIN TRANSACTION;/);
    assert.match(sql, /COMMIT;/);
    assert.match(sql, /INSERT INTO "users"/);
    assert.match(sql, /INSERT INTO "tasks"/);
    assert.match(sql, /Backup me/);
    // Internal sqlite tables must not be dumped.
    assert.doesNotMatch(sql, /INSERT INTO "sqlite_/);
  });
});
