/**
 * Security · Input handling (injection & abuse payloads)
 *
 * Confirms the route boundary treats hostile input as data, not code:
 *  - SQL-injection / XSS strings are stored and returned verbatim (parameterized
 *    queries), and never corrupt the table or escalate to a 500.
 *  - Schema validation rejects wrong types, overlong values, malformed dates,
 *    and unknown fields on strict endpoints with a 400 — not a silent accept.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo } from "../helpers/index.js";

const SQLI = "Robert'); DROP TABLE tasks; --";
const XSS = "<script>alert(document.cookie)</script>";

let token = "";

before(async () => {
  await setupDb();
  ({ token } = await signInDemo());
});

describe("Security · input · injection is stored as inert data", () => {
  test("SQL-injection string in a task title round-trips verbatim and does not drop the table", async () => {
    const { status, body } = await req("POST", "/v1/tasks", { token, body: { title: { en: SQLI } } });
    assert.equal(status, 201);
    assert.equal(body.title.en, SQLI, "payload must be stored as literal text");

    // The table still exists and the row is readable → query was parameterized.
    const { status: getStatus, body: got } = await req("GET", `/v1/tasks/${body.id}`, { token });
    assert.equal(getStatus, 200);
    assert.equal(got.title.en, SQLI);

    const { status: listStatus, body: list } = await req("GET", "/v1/tasks", { token });
    assert.equal(listStatus, 200, "tasks table must be intact after injection attempt");
    assert.ok(Array.isArray(list.items), "paginated envelope with items[]");

    await req("DELETE", `/v1/tasks/${body.id}`, { token });
  });

  test("XSS payload in a person name is stored verbatim (no server-side execution/mangling)", async () => {
    const { status, body } = await req("POST", "/v1/people", {
      token,
      body: { name: XSS, initials: "XS", color: "#5bc8d4" },
    });
    assert.equal(status, 201);
    assert.equal(body.name, XSS, "payload must round-trip unchanged");
    await req("DELETE", `/v1/people/${body.id}`, { token });
  });

  test("SQL-injection in a path param resolves to 404, never 500", async () => {
    const { status } = await req("GET", `/v1/tasks/${encodeURIComponent("' OR '1'='1")}`, { token });
    assert.equal(status, 404);
  });
});

describe("Security · input · schema validation rejects abuse (400)", () => {
  test("wrong type for title → 400", async () => {
    const { status } = await req("POST", "/v1/tasks", { token, body: { title: 12345 } });
    assert.equal(status, 400);
  });

  test("malformed due date → 400", async () => {
    const { status } = await req("POST", "/v1/tasks", { token, body: { title: { en: "x" }, due: "31/12/2099" } });
    assert.equal(status, 400);
  });

  test("overlong password on register → 400", async () => {
    const { status } = await req("POST", "/v1/auth/register", {
      body: { email: "overlong@example.com", password: "a".repeat(500), name: "X" },
    });
    assert.equal(status, 400);
  });

  test("unknown field on a strict endpoint (ai/classify) → 400", async () => {
    const { status } = await req("POST", "/v1/ai/classify", { token, body: { inject: true } });
    assert.equal(status, 400);
  });
});
