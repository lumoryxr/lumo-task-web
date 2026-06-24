/**
 * Security · JWT & encryption-key hardening
 *
 * - JWT verification must pin the algorithm to HS256 (no alg-confusion / HS512
 *   acceptance).
 * - Both LUMO_JWT_SECRET and LUMO_ENCRYPTION_KEY must be rejected when shorter
 *   than 32 bytes, in every environment (no weak-secret backdoor).
 */
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { signToken, verifyToken } from "../../lib/jwt.js";
import { encryptSecret, decryptSecret } from "../../lib/crypto.js";

const ORIG_JWT = process.env.LUMO_JWT_SECRET;
const ORIG_ENC = process.env.LUMO_ENCRYPTION_KEY;

afterEach(() => {
  process.env.LUMO_JWT_SECRET = ORIG_JWT;
  process.env.LUMO_ENCRYPTION_KEY = ORIG_ENC;
});

describe("jwt algorithm pinning", () => {
  test("accepts a normally-issued HS256 token", async () => {
    const tok = await signToken("u_abc", 3);
    const { userId, sv } = await verifyToken(tok);
    assert.equal(userId, "u_abc");
    assert.equal(sv, 3);
  });

  test("rejects a token signed with a non-HS256 algorithm (HS512)", async () => {
    const secret = new TextEncoder().encode(process.env.LUMO_JWT_SECRET!);
    const forged = await new SignJWT({ sub: "u_evil", sv: 0 })
      .setProtectedHeader({ alg: "HS512" })
      .setJti("x")
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);
    await assert.rejects(() => verifyToken(forged));
  });
});

describe("secret length enforcement", () => {
  test("LUMO_JWT_SECRET shorter than 32 bytes is rejected", async () => {
    process.env.LUMO_JWT_SECRET = "short";
    await assert.rejects(() => signToken("u_x"), /LUMO_JWT_SECRET/);
  });

  test("LUMO_ENCRYPTION_KEY shorter than 32 bytes is rejected", () => {
    process.env.LUMO_ENCRYPTION_KEY = "short";
    assert.throws(() => encryptSecret("hello"), /LUMO_ENCRYPTION_KEY/);
  });

  test("a long key still round-trips encrypt/decrypt", () => {
    const ct = encryptSecret("sk-secret-value");
    assert.ok(ct.startsWith("enc:v1:"));
    assert.equal(decryptSecret(ct), "sk-secret-value");
  });
});
