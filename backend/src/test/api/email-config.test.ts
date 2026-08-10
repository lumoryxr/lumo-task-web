/**
 * Unit · email startup config (lib/email-policy)
 *
 * Mirrors the DB/secret boot guards: when an email provider is opted into, a
 * PARTIAL or malformed config must fail FAST at boot with a clear message,
 * instead of silently dropping every password-reset / verification email at
 * runtime (which surfaces to end-users only as "I never got the email").
 *
 * Scope is deliberately narrow so it can't break the desktop/local build:
 * it only asserts when a provider is explicitly configured. No provider set =
 * valid (dev outbox / prod loud no-op unchanged).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkEmailConfig, assertStartupEmailConfig } from "../../lib/email-policy.js";

describe("checkEmailConfig", () => {
  test("no provider configured is valid (unchanged behavior)", () => {
    assert.equal(checkEmailConfig({}).error, null);
    assert.equal(checkEmailConfig({ LUMO_EMAIL_PROVIDER: "" }).error, null);
    assert.equal(checkEmailConfig({ LUMO_EMAIL_PROVIDER: "  " }).error, null);
  });

  test("resend with key + valid from is valid", () => {
    assert.equal(
      checkEmailConfig({
        LUMO_EMAIL_PROVIDER: "resend",
        LUMO_RESEND_API_KEY: "re_123",
        LUMO_EMAIL_FROM: "Lumo <noreply@lumo.example>",
      }).error,
      null,
    );
    assert.equal(
      checkEmailConfig({
        LUMO_EMAIL_PROVIDER: "resend",
        LUMO_RESEND_API_KEY: "re_123",
        LUMO_EMAIL_FROM: "noreply@lumo.example",
      }).error,
      null,
    );
  });

  test("resend WITHOUT an api key is rejected", () => {
    const r = checkEmailConfig({ LUMO_EMAIL_PROVIDER: "resend", LUMO_EMAIL_FROM: "a@b.com" });
    assert.match(r.error ?? "", /LUMO_RESEND_API_KEY/);
  });

  test("resend with a blank api key is rejected", () => {
    const r = checkEmailConfig({
      LUMO_EMAIL_PROVIDER: "resend",
      LUMO_RESEND_API_KEY: "   ",
      LUMO_EMAIL_FROM: "a@b.com",
    });
    assert.match(r.error ?? "", /LUMO_RESEND_API_KEY/);
  });

  test("resend WITHOUT a from address is rejected", () => {
    const r = checkEmailConfig({ LUMO_EMAIL_PROVIDER: "resend", LUMO_RESEND_API_KEY: "re_1" });
    assert.match(r.error ?? "", /LUMO_EMAIL_FROM/);
  });

  test("resend with a from address missing '@' is rejected", () => {
    const r = checkEmailConfig({
      LUMO_EMAIL_PROVIDER: "resend",
      LUMO_RESEND_API_KEY: "re_1",
      LUMO_EMAIL_FROM: "not-an-email",
    });
    assert.match(r.error ?? "", /LUMO_EMAIL_FROM/);
  });

  test("an unknown provider is rejected (typo guard)", () => {
    const r = checkEmailConfig({ LUMO_EMAIL_PROVIDER: "sendgrd", LUMO_RESEND_API_KEY: "x" });
    assert.match(r.error ?? "", /provider/i);
  });

  test("provider name is case/space tolerant", () => {
    assert.equal(
      checkEmailConfig({
        LUMO_EMAIL_PROVIDER: "  Resend ",
        LUMO_RESEND_API_KEY: "re_1",
        LUMO_EMAIL_FROM: "a@b.com",
      }).error,
      null,
    );
  });
});

describe("assertStartupEmailConfig", () => {
  test("does not throw when no provider is configured", () => {
    assert.doesNotThrow(() => assertStartupEmailConfig({}));
  });
  test("throws a clear message on a partial resend config", () => {
    assert.throws(
      () => assertStartupEmailConfig({ LUMO_EMAIL_PROVIDER: "resend" }),
      /LUMO_RESEND_API_KEY/,
    );
  });
});
