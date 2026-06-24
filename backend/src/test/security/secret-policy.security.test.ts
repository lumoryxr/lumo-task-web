/**
 * Security · secret strength policy (issue #49)
 *
 * Lives in the security suite (CLAUDE.md: secrets → `npm run test:security`) so
 * the fail-fast hardening is exercised by the security gate. Unit-level branch
 * coverage is in api/secret-policy-lib.test.ts.
 */
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { assertStrongSecret, validateStartupSecrets } from "../../lib/secret-policy.js";

describe("security · secret policy", () => {
  test("rejects blank, whitespace-padded-low-entropy, short, and placeholder secrets", () => {
    assert.throws(() => assertStrongSecret("S", undefined), /must be set/);
    assert.throws(() => assertStrongSecret("S", " ".repeat(40)), /blank/);
    // 31 real chars + trailing space must NOT pass as 32 bytes
    assert.throws(() => assertStrongSecret("S", "x".repeat(31) + " "), /at least 32 bytes/);
    assert.throws(() => assertStrongSecret("S", "change-me-in-production-use-32+-random-bytes"), /placeholder/);
    assert.throws(() => assertStrongSecret("S", "dev-secret"), /placeholder/);
  });

  test("accepts a real strong secret", () => {
    const v = "Z9-real-secret-with-plenty-of-entropy-0123456789";
    assert.equal(assertStrongSecret("S", v), v);
  });

  const ORIG = process.env.LUMO_JWT_SECRET;
  afterEach(() => { process.env.LUMO_JWT_SECRET = ORIG; });

  test("validateStartupSecrets aborts on a weak JWT secret", () => {
    process.env.LUMO_JWT_SECRET = "change-me-in-production";
    assert.throws(() => validateStartupSecrets(), /LUMO_JWT_SECRET/);
  });
});
