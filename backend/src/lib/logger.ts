/**
 * Structured (JSON-line) application logger — one JSON object per line so log
 * aggregators (Datadog, Loki, CloudWatch, …) can index fields instead of
 * scraping free text. This is the single logging seam for the backend; routes
 * and middleware call `log(...)` rather than `console.*` so every line carries
 * the same base envelope and passes through the same redaction.
 *
 * Every line includes: `level`, `ts` (ISO-8601), `service`, `env`, `version`,
 * plus the caller's fields. `error`-level lines go to stderr; everything else to
 * stdout. Verbosity is controlled by `LUMO_LOG_LEVEL` (debug|info|warn|error|
 * silent; default info), so production can dial logs down and a debugging
 * session can dial them up without a code change.
 *
 * Redaction is mandatory, not advisory: any field whose KEY looks like a
 * credential (password, token, secret, api key, authorization, cookie, refresh…)
 * is replaced with `[REDACTED]` at every depth before serialization, so a
 * careless `log("info", { authorization })` can never leak a secret into the log
 * stream. NEVER rely on this as the primary control — still avoid passing
 * secrets — but it is the backstop a commercial deployment needs.
 *
 * Local file sink: set `LUMO_LOG_FILE` to also append every emitted (already
 * redacted) JSON line to that file, in addition to stdout/stderr. This is for
 * self-hosted deployments (e.g. a VPS) that keep logs on disk instead of
 * shipping them to a hosted aggregator. The file gets the same lines the
 * console does — the level filter and redaction are applied first. A write
 * failure (bad path, full disk) disables the sink and never crashes a request.
 */

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SERVICE = "lumo-backend";
const VERSION = process.env.LUMO_VERSION || "1.0.0";

/** Minimum level to emit, from LUMO_LOG_LEVEL (read per-call so tests can vary it). */
function minWeight(): number {
  const raw = (process.env.LUMO_LOG_LEVEL || "info").toLowerCase();
  if (raw === "silent" || raw === "none" || raw === "off") return Number.POSITIVE_INFINITY;
  return LEVEL_WEIGHT[raw as LogLevel] ?? LEVEL_WEIGHT.info;
}

// Field KEYS that must never carry a raw value in a log line. Matched
// case-insensitively as a substring, so `api_key`, `apiKey`, `refresh_token`,
// `Authorization`, `set-cookie`, `client_secret`, `password_hash` all match.
const SENSITIVE_KEY = /pass(word)?|token|secret|api[_-]?key|apikey|authorization|cookie|credential|refresh|private[_-]?key|session[_-]?id/i;

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;

/**
 * Recursively copy `value`, replacing any credential-like key's value with
 * `[REDACTED]`. Non-plain values (strings/numbers/bools/null) pass through;
 * depth is capped so a pathological/circular structure can't blow the stack.
 */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactForLog(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redactForLog(v, depth + 1);
  }
  return out;
}

// ── Optional local file sink (LUMO_LOG_FILE) ─────────────────────────────────
// Latch the target path we've already ensured a directory for, and the path a
// write has failed for, so we neither mkdir on every line nor retry a broken
// path in a tight loop. Both are keyed on the resolved target: if LUMO_LOG_FILE
// changes at runtime (mainly in tests), the new path starts fresh.
let ensuredDirFor: string | null = null;
let fileSinkBrokenFor: string | null = null;

/** Append one already-serialized line to LUMO_LOG_FILE, if configured. */
function appendToFile(line: string): void {
  const target = process.env.LUMO_LOG_FILE;
  if (!target || fileSinkBrokenFor === target) return;
  try {
    if (ensuredDirFor !== target) {
      fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
      ensuredDirFor = target;
    }
    fs.appendFileSync(target, line + "\n");
  } catch (err) {
    // Disable this path's file sink after the first failure and report it once
    // to stderr. Logging must never throw into a request handler.
    fileSinkBrokenFor = target;
    try {
      console.error(
        JSON.stringify({
          level: "error",
          ts: new Date().toISOString(),
          service: SERVICE,
          msg: "log file sink disabled",
          file: target,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } catch {
      /* nothing more we can safely do */
    }
  }
}

// ── Per-request correlation context (AsyncLocalStorage) ──────────────────────
// The correlation middleware runs each request inside a store carrying its
// requestId + W3C trace ids. `log()` reads the store and stamps every line —
// access log, route logs, audit, and the error log — with the same trace_id /
// span_id WITHOUT threading them through every call site. External log systems
// pull the lines and reconstruct the call chain by trace_id. Zero egress: we
// only propagate ids in headers and logs; nothing is pushed anywhere.
export interface Correlation {
  requestId?: string;
  traceId?: string;
  spanId?: string;
}

const correlationStore = new AsyncLocalStorage<Correlation>();

/** Run `fn` (and everything it awaits) with the given correlation ids in scope. */
export function runWithCorrelation<T>(ctx: Correlation, fn: () => T): T {
  return correlationStore.run(ctx, fn);
}

/** The correlation ids for the current async scope, if any. */
export function currentCorrelation(): Correlation | undefined {
  return correlationStore.getStore();
}

/** Emit one structured log line at `level` with the given fields. */
export function log(level: LogLevel, fields: Record<string, unknown>): void {
  if (LEVEL_WEIGHT[level] < minWeight()) return;

  const base = {
    level,
    ts: new Date().toISOString(),
    service: SERVICE,
    env: process.env.NODE_ENV || "development",
    version: VERSION,
  };
  // Correlation ids from the request scope (if any). Placed after the base and
  // before caller fields so an explicit field of the same name still wins.
  const corr = correlationStore.getStore() ?? {};

  let line: string;
  try {
    line = JSON.stringify({ ...base, ...corr, ...(redactForLog(fields) as Record<string, unknown>) });
  } catch {
    // Never let a non-serializable field (circular ref, BigInt) crash a request.
    line = JSON.stringify({ ...base, msg: "log serialization failed" });
  }

  if (level === "error") console.error(line);
  else console.log(line);

  appendToFile(line);
}

const REQUEST_ID_RE = /^[A-Za-z0-9_.-]{1,128}$/;

/**
 * Trust an inbound `x-request-id` only if it's a short, safe token — otherwise
 * generate a fresh one. Prevents log-forging / header-injection via the header
 * while still honoring a caller-provided trace id from an upstream proxy.
 */
export function resolveRequestId(incoming: string | undefined | null): string {
  if (incoming && REQUEST_ID_RE.test(incoming)) return incoming;
  return crypto.randomUUID();
}

// ── W3C Trace Context (traceparent) ──────────────────────────────────────────
// OpenTelemetry's standard context-propagation format, so the correlation is
// OTel-compatible without pulling in the SDK: `00-<32hex traceId>-<16hex spanId>-<2hex flags>`.
const TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
const ZERO_TRACE = "0".repeat(32);
const ZERO_SPAN = "0".repeat(16);

export interface TraceContext {
  /** 16-byte trace id (32 hex). Reused from a valid inbound traceparent. */
  traceId: string;
  /** Fresh 8-byte span id (16 hex) minted for THIS service's span. */
  spanId: string;
  /** 1-byte trace-flags (2 hex); "01" = sampled. */
  flags: string;
  /** Outgoing traceparent header value carrying our spanId. */
  traceparent: string;
}

/**
 * Resolve the W3C trace context for a request. A well-formed, non-zero inbound
 * `traceparent` continues the same trace (its traceId is reused); otherwise a
 * fresh trace is started. A new spanId is always minted for this hop. An unsafe
 * or malformed header is never trusted — it's replaced, like x-request-id.
 */
export function resolveTraceContext(incoming: string | undefined | null): TraceContext {
  const spanId = randomBytes(8).toString("hex");
  const m = incoming ? incoming.match(TRACEPARENT_RE) : null;
  if (m && m[1].toLowerCase() !== ZERO_TRACE && m[2].toLowerCase() !== ZERO_SPAN) {
    const traceId = m[1].toLowerCase();
    const flags = m[3].toLowerCase();
    return { traceId, spanId, flags, traceparent: `00-${traceId}-${spanId}-${flags}` };
  }
  const traceId = randomBytes(16).toString("hex");
  const flags = "01";
  return { traceId, spanId, flags, traceparent: `00-${traceId}-${spanId}-${flags}` };
}
