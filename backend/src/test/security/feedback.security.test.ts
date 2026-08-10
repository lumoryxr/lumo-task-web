/**
 * Security · Feedback admin authorization
 *
 * Feedback introduces the app's first admin surface, gated by the
 * `LUMO_ADMIN_EMAILS` allow-list rather than any DB role. These tests pin the
 * gate shut: a normal signed-in user (and an anonymous caller) can never reach
 * the admin queue or mutate anyone's feedback, an empty allow-list grants
 * nobody admin, and the match is case-insensitive.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";

let normal = { token: "", userId: "", email: "" };
let operator = { token: "", userId: "", email: "" };
const origAdminEmails = process.env.LUMO_ADMIN_EMAILS;

before(async () => {
  await setupDb();
  const n = await newUserWithToken("secfbuser");
  normal = { token: n.token, userId: n.userId, email: n.email };
  const o = await newUserWithToken("secfbadmin");
  operator = { token: o.token, userId: o.userId, email: o.email };
  // Seed one item so the admin queue has content to (fail to) read.
  await req("POST", "/v1/feedback", { token: normal.token, body: { message: "seed" } });
});

beforeEach(() => {
  // Default: nobody is an admin unless a test opts one in.
  delete process.env.LUMO_ADMIN_EMAILS;
});

after(() => {
  if (origAdminEmails === undefined) delete process.env.LUMO_ADMIN_EMAILS;
  else process.env.LUMO_ADMIN_EMAILS = origAdminEmails;
});

describe("admin endpoints reject non-admins", () => {
  test("401 → anonymous cannot list the admin queue or patch", async () => {
    assert.equal((await req("GET", "/v1/admin/feedback")).status, 401);
    assert.equal((await req("PATCH", "/v1/admin/feedback/fb_x", { body: { status: "closed" } })).status, 401);
  });

  test("403 → an authenticated non-admin is forbidden (email not in allow-list)", async () => {
    process.env.LUMO_ADMIN_EMAILS = operator.email; // normal user is NOT the operator
    const list = await req("GET", "/v1/admin/feedback", { token: normal.token });
    assert.equal(list.status, 403);
    assert.equal(list.body.error.code, "FORBIDDEN");

    const patch = await req("PATCH", "/v1/admin/feedback/fb_x", {
      token: normal.token,
      body: { status: "closed" },
    });
    assert.equal(patch.status, 403);
    assert.equal(patch.body.error.code, "FORBIDDEN");
  });

  test("403 → an empty allow-list grants nobody admin", async () => {
    // No LUMO_ADMIN_EMAILS set (beforeEach cleared it).
    const list = await req("GET", "/v1/admin/feedback", { token: operator.token });
    assert.equal(list.status, 403);
    // And the user-facing capability flag is false for everyone.
    const own = await req("GET", "/v1/feedback", { token: operator.token });
    assert.equal(own.body.isAdmin, false);
  });
});

describe("admin allow-list matching", () => {
  test("the operator (email in the list) is granted access", async () => {
    process.env.LUMO_ADMIN_EMAILS = operator.email;
    const list = await req("GET", "/v1/admin/feedback", { token: operator.token });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.feedback));
  });

  test("matching is case-insensitive and tolerates surrounding list entries", async () => {
    process.env.LUMO_ADMIN_EMAILS = `someone@else.com, ${operator.email.toUpperCase()} ,extra@x.com`;
    const list = await req("GET", "/v1/admin/feedback", { token: operator.token });
    assert.equal(list.status, 200);
  });
});
