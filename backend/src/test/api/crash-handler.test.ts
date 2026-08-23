/**
 * Fatal-crash logging.
 *
 * The backend routes every log line through `lib/logger.ts`: JSON per line,
 * credential keys redacted, optionally mirrored to `LUMO_LOG_FILE` for
 * self-hosted deployments that keep logs on disk.
 *
 * A process-level crash — an unhandled promise rejection or an uncaught
 * exception outside a request — bypassed all of it. Node's default prints a raw
 * stack trace to stderr and exits, so the single most important event in the
 * lifetime of the process produced the one record that the log pipeline never
 * saw: unstructured, un-redacted, and absent from the file sink an operator is
 * actually reading.
 *
 * These handlers put that event back in the stream, then still exit non-zero so
 * the platform restarts the instance — the crash is recorded, not swallowed.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildFatalRecord,
  createCrashHandlers,
  installCrashHandlers,
} from "../../lib/crashHandler.js";

describe("Crash handler · fatal record", () => {
  test("captures the message and stack of an Error", () => {
    const err = new Error("kaboom");
    const record = buildFatalRecord("uncaughtException", err);

    assert.equal(record.msg, "fatal: uncaughtException");
    assert.equal(record.reason, "kaboom");
    assert.match(record.stack ?? "", /kaboom/);
    assert.equal(record.fatal, true);
  });

  test("survives a non-Error rejection value", () => {
    // `Promise.reject("nope")` and `Promise.reject(undefined)` are both legal and
    // both reach this path; neither may throw inside the crash handler itself.
    assert.equal(buildFatalRecord("unhandledRejection", "nope").reason, "nope");
    assert.equal(buildFatalRecord("unhandledRejection", undefined).reason, "undefined");
    assert.equal(buildFatalRecord("unhandledRejection", { code: 42 }).reason, "[object Object]");
  });

  test("carries no stack when the value has none", () => {
    assert.equal(buildFatalRecord("unhandledRejection", "nope").stack, undefined);
  });
});

describe("Crash handler · installation", () => {
  let installed: (() => void) | undefined;

  beforeEach(() => {
    installed = undefined;
  });

  afterEach(() => {
    installed?.();
  });

  test("registers a listener for both fatal signals", () => {
    const before = {
      rejection: process.listenerCount("unhandledRejection"),
      exception: process.listenerCount("uncaughtException"),
    };

    installed = installCrashHandlers({ exit: () => {} });

    assert.equal(process.listenerCount("unhandledRejection"), before.rejection + 1);
    assert.equal(process.listenerCount("uncaughtException"), before.exception + 1);
  });

  test("logs the crash and then exits non-zero", () => {
    const logged: Array<Record<string, unknown>> = [];
    const exits: number[] = [];

    // Called directly rather than via process.emit: the test runner listens for
    // these events too and would score a real emission as a failing test.
    const { onRejection } = createCrashHandlers({
      log: (_level, fields) => logged.push(fields),
      exit: (code) => exits.push(code),
    });

    onRejection(new Error("boom"));

    assert.equal(logged.length, 1, "the crash was not written to the structured log");
    assert.equal(logged[0].fatal, true);
    assert.equal(logged[0].reason, "boom");
    assert.deepEqual(exits, [1], "the process must still exit non-zero so the platform restarts it");
  });

  test("logs at error level so the line reaches stderr and any file sink", () => {
    const levels: string[] = [];
    const { onException } = createCrashHandlers({
      log: (level) => levels.push(level),
      exit: () => {},
    });

    onException(new Error("boom"));
    assert.deepEqual(levels, ["error"]);
  });

  test("a second crash during shutdown does not re-enter the handler", () => {
    // A handler that crashes while logging the first crash must not recurse.
    const exits: number[] = [];
    const { onException } = createCrashHandlers({ log: () => {}, exit: (code) => exits.push(code) });

    onException(new Error("first"));
    onException(new Error("second"));

    assert.deepEqual(exits, [1], "the handler exited more than once");
  });

  test("the returned disposer removes both listeners", () => {
    const before = {
      rejection: process.listenerCount("unhandledRejection"),
      exception: process.listenerCount("uncaughtException"),
    };

    const dispose = installCrashHandlers({ exit: () => {} });
    dispose();

    assert.equal(process.listenerCount("unhandledRejection"), before.rejection);
    assert.equal(process.listenerCount("uncaughtException"), before.exception);
  });
});
