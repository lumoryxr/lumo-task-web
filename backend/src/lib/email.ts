/**
 * Provider-agnostic transactional email.
 *
 * A single `sendEmail()` seam so the rest of the app never talks to a specific
 * provider. Two transports, selected by environment:
 *
 *   • Resend (HTTPS)  — when LUMO_EMAIL_PROVIDER=resend and LUMO_RESEND_API_KEY
 *     is set. A plain REST call (no SDK), from LUMO_EMAIL_FROM.
 *   • Dev / no-op     — otherwise. In non-production it captures messages in an
 *     in-memory outbox (so tests and local flows can read the link) and logs a
 *     one-line, secret-free record. In production with no provider configured it
 *     logs a loud error and sends nothing — the "flip on with your key" state.
 *
 * Add another provider by extending the switch, not by calling it from a route.
 * NEVER log the message body (it can carry a reset link/token); the audit line
 * carries only `to` + `subject`.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body (always provided; the reset link lives here). */
  text: string;
  /** Optional HTML body. */
  html?: string;
}

// Dev-only capture so tests / local runs can read what "would have been sent".
// Never populated in production.
const outbox: EmailMessage[] = [];

/** Drain and return everything captured by the dev transport (test helper). */
export function drainOutbox(): EmailMessage[] {
  const copy = outbox.slice();
  outbox.length = 0;
  return copy;
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

async function sendViaResend(msg: EmailMessage, apiKey: string): Promise<void> {
  const from = process.env.LUMO_EMAIL_FROM;
  if (!from) {
    console.error("[email] LUMO_EMAIL_FROM is not set; cannot send via Resend.");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    }),
  });
  if (!res.ok) {
    // Log the status only — never the body (it echoes the message).
    console.error(`[email] Resend send failed with status ${res.status}`);
  }
}

/**
 * Send a transactional email. Resolves even when no provider is configured (the
 * caller — e.g. forgot-password — must not change its response based on delivery,
 * to avoid leaking whether an address exists).
 */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const provider = process.env.LUMO_EMAIL_PROVIDER;
  const audit = { ts: new Date().toISOString(), email: true, to: msg.to, subject: msg.subject };

  try {
    if (provider === "resend" && process.env.LUMO_RESEND_API_KEY) {
      await sendViaResend(msg, process.env.LUMO_RESEND_API_KEY);
      console.log(JSON.stringify({ ...audit, transport: "resend" }));
      return;
    }

    if (isProd()) {
      console.error(
        "[email] No email provider configured; message NOT sent. " +
          "Set LUMO_EMAIL_PROVIDER=resend, LUMO_RESEND_API_KEY, and LUMO_EMAIL_FROM to enable delivery.",
      );
      return;
    }

    // Dev transport: capture for tests/local, log a secret-free line.
    outbox.push(msg);
    console.log(JSON.stringify({ ...audit, transport: "dev" }));
  } catch (err) {
    console.error("[email] send failed:", err instanceof Error ? err.message : err);
  }
}
