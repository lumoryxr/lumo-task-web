/**
 * Standards · Error-envelope conformance
 *
 * Every business-logic error (from `httpError` / global `app.onError`) must
 * match the `ApiError` contract: `{ error: { code, message } }`. We drive a
 * representative error path on each major route and parse the body with the
 * contract schema, so a route that invents its own error shape fails CI.
 *
 * (Schema-validation 400s come from @hono/zod-validator's own formatter, which
 * is intentionally a different shape, so those are out of scope here.)
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { ApiErrorSchema } from "@lumo/contracts";
import { req, setupDb, signInDemo, newUserWithToken } from "../helpers/index.js";

let token = "";

before(async () => {
  await setupDb();
  ({ token } = await signInDemo());
});

interface ErrCase {
  name: string;
  run: () => Promise<{ status: number; body: any }>;
  status: number;
}

describe("Standards · error envelope", () => {
  const cases: ErrCase[] = [
    { name: "401 unauthenticated (no token)", status: 401, run: () => req("GET", "/v1/user") },
    { name: "401 bad token", status: 401, run: () => req("GET", "/v1/tasks", { token: "garbage" }) },
    { name: "404 unknown task", status: 404, run: () => req("GET", "/v1/tasks/nope", { token }) },
    { name: "404 unknown person (PATCH)", status: 404, run: () => req("PATCH", "/v1/people/nope", { token, body: { name: "x" } }) },
    { name: "404 unknown habit (DELETE)", status: 404, run: () => req("DELETE", "/v1/habits/nope", { token }) },
    { name: "404 unknown countdown (PATCH)", status: 404, run: () => req("PATCH", "/v1/countdowns/nope", { token, body: { title: "x" } }) },
  ];

  for (const c of cases) {
    test(`${c.name} → ${c.status} with ApiError envelope`, async () => {
      const { status, body } = await c.run();
      assert.equal(status, c.status, `expected ${c.status}, got ${status}`);
      const parsed = ApiErrorSchema.safeParse(body);
      assert.ok(parsed.success, `body must match ApiError contract: ${JSON.stringify(body)}`);
    });
  }

  test("409 duplicate register → ApiError envelope", async () => {
    const { username } = await newUserWithToken("dup");
    const { status, body } = await req("POST", "/v1/auth/register", {
      body: { username, password: "password123" },
    });
    assert.equal(status, 409);
    assert.ok(ApiErrorSchema.safeParse(body).success, `409 body must match ApiError: ${JSON.stringify(body)}`);
  });

  test("400 business-logic error (wrong current password) → ApiError envelope", async () => {
    const { token: t } = await newUserWithToken("cp");
    const { status, body } = await req("POST", "/v1/auth/change-password", {
      token: t,
      body: { current_password: "definitely-wrong", new_password: "newpass456" },
    });
    assert.equal(status, 400);
    assert.ok(ApiErrorSchema.safeParse(body).success, `400 body must match ApiError: ${JSON.stringify(body)}`);
  });
});
