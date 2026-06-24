/**
 * Unit · JWT & crypto key hardening (lib/jwt, lib/crypto)
 *
 * In the coverage-measured api suite so the algorithm-pinning and
 * minimum-key-length branches are exercised by the coverage gate. Node isolates
 * each test file in its own process, so the env mutations here don't leak.
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

describe("lib/jwt hardening", () => {
  test("HS256 round-trips", async () => {
    const { userId, sv } = await verifyToken(await signToken("u_1", 7));
    assert.equal(userId, "u_1");
    assert.equal(sv, 7);
  });
  test("rejects HS512-signed token", async () => {
    const secret = new TextEncoder().encode(process.env.LUMO_JWT_SECRET!);
    const forged = await new SignJWT({ sub: "u_e", sv: 0 })
      .setProtectedHeader({ alg: "HS512" }).setJti("j").setIssuedAt().setExpirationTime("7d").sign(secret);
    await assert.rejects(() => verifyToken(forged));
  });
  test("rejects missing secret", async () => {
    delete process.env.LUMO_JWT_SECRET;
    await assert.rejects(() => signToken("u"), /must be set/);
  });
  test("rejects secret under 32 bytes", async () => {
    process.env.LUMO_JWT_SECRET = "tooshort";
    await assert.rejects(() => signToken("u"), /at least 32 bytes/);
  });
});

describe("lib/crypto hardening", () => {
  test("round-trips with a valid key", () => {
    const ct = encryptSecret("sk-123");
    assert.ok(ct.startsWith("enc:v1:"));
    assert.equal(decryptSecret(ct), "sk-123");
  });
  test("rejects missing key", () => {
    delete process.env.LUMO_ENCRYPTION_KEY;
    assert.throws(() => encryptSecret("x"), /must be set/);
  });
  test("rejects key under 32 bytes", () => {
    process.env.LUMO_ENCRYPTION_KEY = "tooshort";
    assert.throws(() => encryptSecret("x"), /at least 32 bytes/);
  });
  test("empty plaintext passes through without needing the key", () => {
    assert.equal(encryptSecret(""), "");
    assert.equal(decryptSecret(""), "");
  });
});
