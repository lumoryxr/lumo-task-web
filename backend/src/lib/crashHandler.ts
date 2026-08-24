import { log as defaultLog, type LogLevel } from "./logger.js";

/**
 * Process-level crash logging.
 *
 * Every deliberate log line in this backend goes through `lib/logger.ts`: one
 * JSON object per line, credential-shaped keys redacted, optionally mirrored to
 * `LUMO_LOG_FILE` for self-hosted deployments that keep logs on disk rather than
 * shipping them to an aggregator.
 *
 * A crash outside a request — an unhandled promise rejection, or an uncaught
 * exception in a timer or an event handler — bypassed all of that. Node's
 * default behaviour is to print a raw stack trace to stderr and exit, which
 * means the single most important event in the life of the process produced the
 * one record the log pipeline never saw: unstructured, so an aggregator can't
 * index it; un-redacted, so a secret caught in an error message goes out in the
 * clear; and missing from the file sink the operator is actually tailing.
 *
 * These handlers put that event back into the stream and then still exit
 * non-zero, so the platform restarts the instance exactly as before. The crash
 * is recorded, never swallowed: a handler that logged and carried on would leave
 * the process in the indeterminate state that made Node exit in the first place.
 */

export interface FatalRecord {
  msg: string;
  fatal: true;
  /** `unhandledRejection` or `uncaughtException`. */
  signal: string;
  /** The rejection value / error message, stringified defensively. */
  reason: string;
  stack?: string;
}

/**
 * Describe a fatal event as a log record.
 *
 * Defensive about its input on purpose: `Promise.reject("nope")` and
 * `Promise.reject(undefined)` are both legal and both arrive here. Throwing
 * while building the crash record would replace a diagnosable crash with an
 * undiagnosable one.
 */
export function buildFatalRecord(signal: string, value: unknown): FatalRecord {
  const isError = value instanceof Error;
  return {
    msg: `fatal: ${signal}`,
    fatal: true,
    signal,
    reason: isError ? value.message : String(value),
    stack: isError ? value.stack : undefined,
  };
}

export interface CrashHandlerOptions {
  /** Defaults to the structured logger. Injected in tests. */
  log?: (level: LogLevel, fields: Record<string, unknown>) => void;
  /** Defaults to `process.exit`. Injected in tests. */
  exit?: (code: number) => void;
}

export interface CrashHandlers {
  onRejection: (value: unknown) => void;
  onException: (value: unknown) => void;
}

/**
 * Build the pair of fatal handlers without registering them.
 *
 * Separated from {@link installCrashHandlers} so the behaviour can be exercised
 * by calling the handler directly. Emitting a real `unhandledRejection` to test
 * it is not an option: the test runner listens for that event too and would
 * score the emission as a failing test.
 */
export function createCrashHandlers(options: CrashHandlerOptions = {}): CrashHandlers {
  const log = options.log ?? defaultLog;
  const exit = options.exit ?? ((code: number) => process.exit(code));

  // A crash raised *while* handling the first crash must not recurse into
  // another log-and-exit; the first record is the one that matters.
  let crashed = false;

  const handle = (signal: string) => (value: unknown) => {
    if (crashed) return;
    crashed = true;
    try {
      log("error", buildFatalRecord(signal, value) as unknown as Record<string, unknown>);
    } catch {
      // The logger itself failed (a full disk on the file sink, say). Fall back
      // to raw stderr rather than losing the crash entirely.
      console.error(`fatal: ${signal}`, value);
    }
    exit(1);
  };

  return {
    onRejection: handle("unhandledRejection"),
    onException: handle("uncaughtException"),
  };
}

/**
 * Install listeners for both fatal process signals.
 *
 * Returns a disposer that removes them again — used by tests, and available to
 * an embedder that wants to manage the process lifecycle itself.
 */
export function installCrashHandlers(options: CrashHandlerOptions = {}): () => void {
  const { onRejection, onException } = createCrashHandlers(options);

  process.on("unhandledRejection", onRejection);
  process.on("uncaughtException", onException);

  return () => {
    process.off("unhandledRejection", onRejection);
    process.off("uncaughtException", onException);
  };
}
