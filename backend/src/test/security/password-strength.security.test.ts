/**
 * Security · Password strength
 *
 * New passwords (register + change-password) must be at least 8 chars and
 * contain both a letter and a digit.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, uniqueEmail } from "../helpers/index.js";

before(setupDb);

describe("password strength on register", () => {
  test("rejects a password with no digit", async () => {
    const { status } = await req("POST", "/v1/auth/register", {
      body: { email: uniqueEmail("weak"), password: "onlyletters", name: "Weak" },
    });
    assert.equal(status, 400);
  });

  test("rejects a password with no letter", async () => {
    const { status } = await req("POST", "/v1/auth/register", {
      body: { email: uniqueEmail("weak2"), password: "12345678", name: "Weak" },
    });
    assert.equal(status, 400);
  });

  test("accepts a strong password (letters + digits, ≥8)", async () => {
    const { status } = await req("POST", "/v1/auth/register", {
      body: { email: uniqueEmail("strong"), password: "Strong1234", name: "Strong" },
    });
    assert.equal(status, 201);
  });
});
