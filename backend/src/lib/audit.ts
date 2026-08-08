/**
 * Structured audit log for security-relevant events (auth, password reset,
 * account deletion, …). Emitted through the shared {@link log} seam so every
 * audit line carries the same base envelope (level, ts, service, env, version)
 * and passes through the same secret redaction as the rest of the app, while
 * staying greppable by its stable `category: "audit"` + `audit: <event>` keys.
 *
 * Pass identifiers only (userId, email, ip) and the event — NEVER secrets
 * (passwords, tokens, API keys). Credential-like keys are redacted by the logger
 * as a backstop, but audit records should not contain them in the first place.
 */
import { log } from "./logger.js";

export function audit(event: string, fields: Record<string, unknown> = {}): void {
  log("info", { category: "audit", audit: event, ...fields });
}
