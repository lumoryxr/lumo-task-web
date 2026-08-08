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
 */

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

  let line: string;
  try {
    line = JSON.stringify({ ...base, ...(redactForLog(fields) as Record<string, unknown>) });
  } catch {
    // Never let a non-serializable field (circular ref, BigInt) crash a request.
    line = JSON.stringify({ ...base, msg: "log serialization failed" });
  }

  if (level === "error") console.error(line);
  else console.log(line);
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
