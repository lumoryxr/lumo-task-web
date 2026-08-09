/**
 * Unit · database startup config (db/dbConfig)
 *
 * Guards the two most common Render/cloud deploy footguns, so a misconfigured
 * Turso setup fails FAST at boot with a clear, actionable message instead of
 * throwing a cryptic connection error mid-migration (which surfaces on Render
 * only as a generic "deploy failed" / health-check timeout).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkDbConfig, assertStartupDbConfig } from "../../db/dbConfig.js";

describe("checkDbConfig", () => {
  test("local mode (no Turso vars) is valid", () => {
    assert.deepEqual(checkDbConfig({}), { mode: "local", error: null });
    assert.deepEqual(checkDbConfig({ LUMO_DB_PATH: "/data/lumo.db" }), { mode: "local", error: null });
  });

  test("cloud mode with url + token + valid scheme is valid", () => {
    assert.deepEqual(
      checkDbConfig({ TURSO_DATABASE_URL: "libsql://lumo-org.turso.io", TURSO_AUTH_TOKEN: "tok" }),
      { mode: "cloud", error: null },
    );
    assert.equal(
      checkDbConfig({ TURSO_DATABASE_URL: "https://lumo-org.turso.io", TURSO_AUTH_TOKEN: "tok" }).error,
      null,
    );
  });

  test("a REMOTE cloud url WITHOUT an auth token is rejected (hosted Turso needs a token)", () => {
    const r = checkDbConfig({ TURSO_DATABASE_URL: "libsql://lumo-org.turso.io" });
    assert.equal(r.mode, "cloud");
    assert.match(r.error ?? "", /TURSO_AUTH_TOKEN/);
  });

  test("a remote cloud url with a blank/whitespace auth token is rejected", () => {
    const r = checkDbConfig({ TURSO_DATABASE_URL: "libsql://lumo-org.turso.io", TURSO_AUTH_TOKEN: "   " });
    assert.match(r.error ?? "", /TURSO_AUTH_TOKEN/);
  });

  test("an auth token set WITHOUT a database url is rejected (would silently fall back to ephemeral local)", () => {
    const r = checkDbConfig({ TURSO_AUTH_TOKEN: "tok" });
    assert.match(r.error ?? "", /TURSO_DATABASE_URL/);
  });

  test("a file: database url is VALID and needs no token (createClient accepts file: — the test-env pattern)", () => {
    assert.deepEqual(checkDbConfig({ TURSO_DATABASE_URL: "file:local.db" }), { mode: "cloud", error: null });
    // e.g. the in-memory URL used by src/test/.env.test
    assert.equal(checkDbConfig({ TURSO_DATABASE_URL: "file::memory:?cache=shared" }).error, null);
  });

  test("a database url with an unsupported/no scheme is rejected", () => {
    const r = checkDbConfig({ TURSO_DATABASE_URL: "lumo-org.turso.io", TURSO_AUTH_TOKEN: "tok" });
    assert.match(r.error ?? "", /scheme/);
  });

  test("surrounding whitespace on the url is tolerated (trimmed)", () => {
    const r = checkDbConfig({ TURSO_DATABASE_URL: "  libsql://lumo-org.turso.io  ", TURSO_AUTH_TOKEN: "tok" });
    assert.equal(r.error, null);
  });
});

describe("assertStartupDbConfig", () => {
  test("does not throw for a valid local config", () => {
    assert.doesNotThrow(() => assertStartupDbConfig({}));
  });
  test("throws with a clear message for a partial cloud config", () => {
    assert.throws(
      () => assertStartupDbConfig({ TURSO_DATABASE_URL: "libsql://x.turso.io" }),
      /TURSO_AUTH_TOKEN/,
    );
  });
});
