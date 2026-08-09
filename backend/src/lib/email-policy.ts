/**
 * Boot-time validation of the transactional-email configuration read by
 * `lib/email.ts`. Its job: when an email provider is OPTED INTO via
 * `LUMO_EMAIL_PROVIDER`, make a partial/malformed config fail FAST and loud at
 * startup — instead of the app booting happily and then silently dropping every
 * password-reset and verification email (which the sender can't surface,
 * because those flows must not reveal delivery status to avoid account
 * enumeration). Same posture as the secret / DB-config boot guards.
 *
 * Deliberately narrow: it asserts ONLY when a provider is explicitly set. With
 * no provider configured it returns valid, so the desktop/local build (which
 * uses recovery codes offline and needs no SMTP) is never affected.
 *
 * Pure + env-injected so it is unit-testable without touching `process.env`.
 */

export interface EmailEnv {
  LUMO_EMAIL_PROVIDER?: string;
  LUMO_RESEND_API_KEY?: string;
  LUMO_EMAIL_FROM?: string;
}

const SUPPORTED_PROVIDERS = ["resend"];

/** Minimal sanity check that a "from" is an address or `Name <addr>` form. */
function looksLikeFrom(value: string): boolean {
  // Accept either a bare address or a display-name form; require an "@" with a
  // dotted domain somewhere. Not RFC-complete — just enough to catch typos /
  // an accidental display-name-only value that Resend would reject at runtime.
  const addr = value.includes("<") ? (value.match(/<([^>]*)>/)?.[1] ?? "") : value;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr.trim());
}

/** Classify the email config and return the first config error (or null). */
export function checkEmailConfig(env: EmailEnv): { error: string | null } {
  const provider = env.LUMO_EMAIL_PROVIDER?.trim().toLowerCase();

  // No provider configured → not an error. Dev captures to an in-memory outbox;
  // production logs a loud no-op (see lib/email.ts). Opt-in only.
  if (!provider) return { error: null };

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return {
      error:
        `LUMO_EMAIL_PROVIDER="${env.LUMO_EMAIL_PROVIDER}" is not a supported email provider ` +
        `(supported: ${SUPPORTED_PROVIDERS.join(", ")}). Unset it to use the built-in no-op, ` +
        `or set a supported provider.`,
    };
  }

  if (provider === "resend") {
    if (!env.LUMO_RESEND_API_KEY || env.LUMO_RESEND_API_KEY.trim().length === 0) {
      return {
        error:
          "LUMO_EMAIL_PROVIDER=resend but LUMO_RESEND_API_KEY is missing/blank — reset & " +
          "verification emails would be silently dropped. Set LUMO_RESEND_API_KEY.",
      };
    }
    const from = env.LUMO_EMAIL_FROM?.trim();
    if (!from) {
      return {
        error:
          "LUMO_EMAIL_PROVIDER=resend but LUMO_EMAIL_FROM is missing/blank — Resend requires a " +
          "verified sender. Set LUMO_EMAIL_FROM (e.g. \"Lumo <noreply@yourdomain>\").",
      };
    }
    if (!looksLikeFrom(from)) {
      return {
        error:
          `LUMO_EMAIL_FROM ("${from}") is not a valid sender address — use an email or ` +
          `"Name <email@domain>" form with a verified domain.`,
      };
    }
  }

  return { error: null };
}

/** Boot-time assertion. Throws with a clear, secret-free message on misconfig. */
export function assertStartupEmailConfig(env: EmailEnv = process.env): void {
  const { error } = checkEmailConfig(env);
  if (error) throw new Error(error);
}
