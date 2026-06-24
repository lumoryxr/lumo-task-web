/**
 * Structured audit log for security-relevant events.
 *
 * Emits one JSON object per line to stdout — greppable and ready to ship to a
 * log aggregator. NEVER pass secrets (passwords, tokens, API keys) in `fields`;
 * log identifiers (userId, email, ip) and the event only.
 */
export function audit(event: string, fields: Record<string, unknown> = {}): void {
  const line = { ts: new Date().toISOString(), audit: event, ...fields };
  try {
    console.log(JSON.stringify(line));
  } catch {
    console.log(JSON.stringify({ ts: line.ts, audit: event }));
  }
}
