/**
 * Security · Secret encryption (AES-256-GCM)
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret, isEncrypted } from "../../lib/crypto.js";

describe("secret encryption", () => {
  test("round-trips a secret without leaking plaintext", () => {
    const plain = "sk-test-1234567890-SUPER-SECRET";
    const enc = encryptSecret(plain);
    assert.ok(isEncrypted(enc), "ciphertext must carry the enc: prefix");
    assert.ok(!enc.includes(plain), "ciphertext must not contain the plaintext");
    assert.equal(decryptSecret(enc), plain);
  });

  test("is idempotent — never double-encrypts", () => {
    const enc = encryptSecret("abc");
    assert.equal(encryptSecret(enc), enc);
  });

  test("passes through empty values and legacy plaintext", () => {
    assert.equal(encryptSecret(""), "");
    assert.equal(decryptSecret(""), "");
    assert.equal(decryptSecret(null), "");
    assert.equal(decryptSecret("legacy-plaintext-key"), "legacy-plaintext-key");
  });

  test("uses a random IV — same input yields different ciphertext", () => {
    assert.notEqual(encryptSecret("same"), encryptSecret("same"));
  });

  test("tampered ciphertext fails authentication", () => {
    const enc = encryptSecret("secret");
    const tampered = enc.slice(0, -4) + "AAAA";
    assert.throws(() => decryptSecret(tampered));
  });
});
