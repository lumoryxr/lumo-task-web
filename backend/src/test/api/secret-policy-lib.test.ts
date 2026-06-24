/**
 * Unit · secret policy (lib/secret-policy)  — issue #49
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assertStrongSecret, validateStartupSecrets } from "../../lib/secret-policy.js";

describe("assertStrongSecret", () => {
  const ok = "a-perfectly-fine-32plus-byte-secret-value";

  test("accepts a strong secret and returns it", () => {
    assert.equal(assertStrongSecret("X", ok), ok);
  });
  test("rejects missing", () => assert.throws(() => assertStrongSecret("X", undefined), /must be set/));
  test("rejects empty", () => assert.throws(() => assertStrongSecret("X", ""), /must be set/));
  test("rejects under 32 bytes", () => assert.throws(() => assertStrongSecret("X", "short"), /at least 32 bytes/));
  test("rejects whitespace-only ≥32 bytes (AC-2)", () =>
    assert.throws(() => assertStrongSecret("X", " ".repeat(40)), /blank/));
  test("rejects known placeholders (AC-3)", () => {
    for (const p of [
      "change-me-in-production-use-32+-random-bytes",
      "change-me-in-production",
      "dev-secret-change-in-production",
    ]) {
      assert.throws(() => assertStrongSecret("X", p), /placeholder/);
    }
  });
});

describe("validateStartupSecrets", () => {
  const ORIG_J = process.env.LUMO_JWT_SECRET;
  const ORIG_E = process.env.LUMO_ENCRYPTION_KEY;

  test("passes with the valid test-env secrets", () => {
    assert.doesNotThrow(() => validateStartupSecrets());
  });
  test("throws when JWT secret is weak", () => {
    process.env.LUMO_JWT_SECRET = "short";
    try {
      assert.throws(() => validateStartupSecrets(), /LUMO_JWT_SECRET/);
    } finally {
      process.env.LUMO_JWT_SECRET = ORIG_J;
    }
  });
  test("throws when encryption key is blank", () => {
    process.env.LUMO_ENCRYPTION_KEY = " ".repeat(40);
    try {
      assert.throws(() => validateStartupSecrets(), /LUMO_ENCRYPTION_KEY/);
    } finally {
      process.env.LUMO_ENCRYPTION_KEY = ORIG_E;
    }
  });
});
