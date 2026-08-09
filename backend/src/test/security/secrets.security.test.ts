/**
 * Security · Secret exposure
 *
 * Credentials must never leave the server. We plant a real AI provider key,
 * then assert representative responses expose only `hasKey: boolean` — never
 * the raw key — and that no auth/user payload carries a `password_hash`.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo, DEMO_USERNAME, DEMO_PASSWORD, assertNoSecrets } from "../helpers/index.js";

const PLANTED_KEY = "sk-test-SUPER-SECRET-pl4nted-key-do-not-leak-0xDEADBEEF";

let token = "";

before(async () => {
  await setupDb();
  ({ token } = await signInDemo());
});

describe("Security · secrets · AI provider keys", () => {
  test("GET /v1/settings exposes hasKey:true but never the raw key", async () => {
    const patch = await req("PATCH", "/v1/settings", {
      token,
      body: { ai_configs_update: { provider: "openai", key: PLANTED_KEY } },
    });
    assert.equal(patch.status, 200);

    const { status, body } = await req("GET", "/v1/settings", { token });
    assert.equal(status, 200);
    assert.equal(body.ai_provider_configs.openai.hasKey, true, "hasKey should reflect the planted key");
    assert.equal("key" in body.ai_provider_configs.openai, false, "raw key field must not be present");
    assertNoSecrets(body, [PLANTED_KEY]);
  });

  test("PATCH /v1/settings response also withholds the raw key", async () => {
    const { status, body } = await req("PATCH", "/v1/settings", {
      token,
      body: { ai_configs_update: { provider: "deepseek", key: PLANTED_KEY } },
    });
    assert.equal(status, 200);
    assert.equal(body.ai_provider_configs.deepseek.hasKey, true);
    assertNoSecrets(body, [PLANTED_KEY]);
  });
});

describe("Security · secrets · password hashes", () => {
  test("register response carries no password_hash", async () => {
    const { body } = await req("POST", "/v1/auth/register", {
      body: { username: "secretsreg", password: "password123" },
    });
    // The recovery code is a one-time secret returned by design; exclude it from
    // the leak scan (it is the plaintext, shown once, never persisted in clear).
    const { recoveryCode, ...rest } = body;
    assertNoSecrets(rest, ["password123"]);
  });

  test("signin response carries no password_hash", async () => {
    const { body } = await req("POST", "/v1/auth/signin", {
      body: { username: DEMO_USERNAME, password: DEMO_PASSWORD },
    });
    assertNoSecrets(body, [DEMO_PASSWORD]);
  });

  test("GET /v1/user carries no password_hash", async () => {
    const { body } = await req("GET", "/v1/user", { token });
    assertNoSecrets(body);
  });
});
