/**
 * API · structured logger — base envelope, level filtering, secret redaction.
 */
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { log, redactForLog } from "../../lib/logger.js";

/** Capture every stdout+stderr log line emitted while `fn` runs. */
function capture(fn: () => void): string[] {
  const lines: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (l: unknown) => lines.push(String(l));
  console.error = (l: unknown) => lines.push(String(l));
  try {
    fn();
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  return lines;
}

const origLevel = process.env.LUMO_LOG_LEVEL;
afterEach(() => {
  if (origLevel === undefined) delete process.env.LUMO_LOG_LEVEL;
  else process.env.LUMO_LOG_LEVEL = origLevel;
});

describe("log() base envelope", () => {
  test("every line carries level, ts, service, env, version + caller fields", () => {
    const [line] = capture(() => log("info", { requestId: "r1", route: "GET /x" }));
    const o = JSON.parse(line);
    assert.equal(o.level, "info");
    assert.equal(o.service, "lumo-backend");
    assert.ok(o.env, "env present");
    assert.ok(o.version, "version present");
    assert.ok(typeof o.ts === "string");
    assert.equal(o.requestId, "r1");
    assert.equal(o.route, "GET /x");
  });
});

describe("log() level filtering via LUMO_LOG_LEVEL", () => {
  test("at warn, info/debug are suppressed but warn/error emit", () => {
    process.env.LUMO_LOG_LEVEL = "warn";
    assert.equal(capture(() => log("debug", { msg: "d" })).length, 0);
    assert.equal(capture(() => log("info", { msg: "i" })).length, 0);
    assert.equal(capture(() => log("warn", { msg: "w" })).length, 1);
    assert.equal(capture(() => log("error", { msg: "e" })).length, 1);
  });

  test("silent suppresses everything, including error", () => {
    process.env.LUMO_LOG_LEVEL = "silent";
    assert.equal(capture(() => log("error", { msg: "e" })).length, 0);
  });

  test("debug emits when the level is lowered to debug", () => {
    process.env.LUMO_LOG_LEVEL = "debug";
    assert.equal(capture(() => log("debug", { msg: "d" })).length, 1);
  });
});

describe("log() routes error to stderr", () => {
  test("error uses console.error; info uses console.log", () => {
    const errLines: string[] = [];
    const outLines: string[] = [];
    const oe = console.error, ol = console.log;
    console.error = (l: unknown) => errLines.push(String(l));
    console.log = (l: unknown) => outLines.push(String(l));
    try {
      log("error", { msg: "boom" });
      log("info", { msg: "ok" });
    } finally {
      console.error = oe;
      console.log = ol;
    }
    assert.equal(errLines.length, 1);
    assert.equal(outLines.length, 1);
    assert.equal(JSON.parse(errLines[0]).level, "error");
  });
});

describe("redactForLog", () => {
  test("scrubs credential-like keys at every depth, keeps the rest", () => {
    const out = redactForLog({
      userId: "u_1",
      password: "hunter2",
      authorization: "Bearer abc",
      nested: { api_key: "sk-secret", refreshToken: "rt_x", keep: "visible" },
      list: [{ client_secret: "cs" }, { ok: 1 }],
    }) as any;
    assert.equal(out.userId, "u_1");
    assert.equal(out.password, "[REDACTED]");
    assert.equal(out.authorization, "[REDACTED]");
    assert.equal(out.nested.api_key, "[REDACTED]");
    assert.equal(out.nested.refreshToken, "[REDACTED]");
    assert.equal(out.nested.keep, "visible");
    assert.equal(out.list[0].client_secret, "[REDACTED]");
    assert.equal(out.list[1].ok, 1);
  });

  test("a planted secret value never reaches the emitted line", () => {
    const secret = "sk-super-secret-value-123456";
    const [line] = capture(() =>
      log("info", { msg: "auth", token: secret, meta: { apiKey: secret } }),
    );
    assert.ok(!line.includes(secret), "secret value leaked into the log line");
    assert.match(line, /\[REDACTED\]/);
  });
});
