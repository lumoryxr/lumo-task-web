/**
 * API · Settings
 *   GET /v1/settings · PATCH /v1/settings
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo } from "../helpers/index.js";

let demoToken = "";

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
});

describe("GET /v1/settings", () => {
  test("200 → returns all setting fields", async () => {
    const { status, body } = await req("GET", "/v1/settings", { token: demoToken });
    assert.equal(status, 200);
    assert.ok("locale" in body);
    assert.ok("accent" in body);
    assert.ok("density" in body);
    assert.ok("pomodoro_duration" in body);
    assert.ok("reduced_motion" in body);
    assert.ok("ai_enabled" in body);
    assert.ok("onboarding_complete" in body);
  });

  test("401 → no token", async () => {
    const { status } = await req("GET", "/v1/settings");
    assert.equal(status, 401);
  });
});

describe("PATCH /v1/settings", () => {
  test("200 → updates locale to zh", async () => {
    const { status, body } = await req("PATCH", "/v1/settings", {
      token: demoToken,
      body: { locale: "zh" },
    });
    assert.equal(status, 200);
    assert.equal(body.locale, "zh");
  });

  test("200 → updates multiple fields atomically", async () => {
    const { status, body } = await req("PATCH", "/v1/settings", {
      token: demoToken,
      body: { locale: "en", accent: "cyan", pomodoro_duration: 30 },
    });
    assert.equal(status, 200);
    assert.equal(body.locale, "en");
    assert.equal(body.accent, "cyan");
    assert.equal(body.pomodoro_duration, 30);
  });

  test("200 → boolean fields coerce correctly", async () => {
    const { status, body } = await req("PATCH", "/v1/settings", {
      token: demoToken,
      body: { reduced_motion: true, ai_enabled: false },
    });
    assert.equal(status, 200);
    assert.equal(body.reduced_motion, true);
    assert.equal(body.ai_enabled, false);
  });

  test("400 → invalid locale enum value", async () => {
    const { status } = await req("PATCH", "/v1/settings", {
      token: demoToken,
      body: { locale: "fr" },
    });
    assert.equal(status, 400);
  });

  test("400 → invalid accent enum value", async () => {
    const { status } = await req("PATCH", "/v1/settings", {
      token: demoToken,
      body: { accent: "hotpink" },
    });
    assert.equal(status, 400);
  });

  test("401 → no token", async () => {
    const { status } = await req("PATCH", "/v1/settings", {
      body: { locale: "en" },
    });
    assert.equal(status, 401);
  });

  test("200 → accepts a public AI baseUrl", async () => {
    const { status, body } = await req("PATCH", "/v1/settings", {
      token: demoToken,
      body: { ai_configs_update: { provider: "custom", key: "k", baseUrl: "https://api.openai.com/v1" } },
    });
    assert.equal(status, 200);
    assert.equal(body.ai_provider_configs.custom.baseUrl, "https://api.openai.com/v1");
  });

  test("400 → rejects an AI baseUrl pointing at cloud metadata (SSRF)", async () => {
    const { status, body } = await req("PATCH", "/v1/settings", {
      token: demoToken,
      body: { ai_configs_update: { provider: "custom", key: "k", baseUrl: "http://169.254.169.254/latest/meta-data/" } },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, "INVALID_BASE_URL");
  });

  test("400 → rejects an AI baseUrl pointing at a private host (SSRF)", async () => {
    const { status, body } = await req("PATCH", "/v1/settings", {
      token: demoToken,
      body: { ai_configs_update: { provider: "custom", key: "k", baseUrl: "http://10.0.0.5:8080/v1" } },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, "INVALID_BASE_URL");
  });
});
