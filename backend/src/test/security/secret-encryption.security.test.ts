/**
 * Security · Secrets are encrypted at rest
 *
 * AI provider keys are stored in settings.ai_configs. The raw DB value must be
 * ciphertext — never the plaintext key — and must decrypt back to the original.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo } from "../helpers/index.js";
import { queryOne } from "../../db/client.js";
import { decryptSecret, isEncrypted } from "../../lib/crypto.js";

let token = "";
let userId = "";
const PLAINTEXT_KEY = "sk-PLAINTEXT-must-never-be-stored-0xCAFEBABE";

before(async () => {
  await setupDb();
  ({ token, userId } = await signInDemo());
});

describe("AI provider keys encrypted at rest", () => {
  test("stored ai_configs holds ciphertext, never the plaintext key", async () => {
    const patch = await req("PATCH", "/v1/settings", {
      token,
      body: { ai_configs_update: { provider: "openai", key: PLAINTEXT_KEY } },
    });
    assert.equal(patch.status, 200);

    const row = await queryOne<{ ai_configs: string }>(
      "SELECT ai_configs FROM settings WHERE user_id = :uid",
      { uid: userId },
    );
    assert.ok(row, "settings row exists");
    assert.ok(!row!.ai_configs.includes(PLAINTEXT_KEY), "plaintext key must NOT be persisted");

    const stored = JSON.parse(row!.ai_configs).openai.key as string;
    assert.ok(isEncrypted(stored), "stored key must be encrypted");
    assert.equal(decryptSecret(stored), PLAINTEXT_KEY, "decrypts back to the original key");
  });
});
