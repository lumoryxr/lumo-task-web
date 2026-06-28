/**
 * Minimal structured (JSON-line) logger for request correlation and traceable
 * errors. One JSON object per line to stdout/stderr so log aggregators can
 * parse fields (requestId, status, durationMs, …) instead of scraping free
 * text. Replaces ad-hoc `console.*` for the request/error paths so a prod 500
 * can be traced back to a single request via its id.
 */
export type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, fields: Record<string, unknown>): void {
  let line: string;
  try {
    line = JSON.stringify({ level, ts: new Date().toISOString(), ...fields });
  } catch {
    // Never let a non-serializable field (circular ref, BigInt) crash a request.
    line = JSON.stringify({ level, ts: new Date().toISOString(), msg: "log serialization failed" });
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
