/**
 * Client-side auth form validation — mirrors the backend's Zod rules
 * (`backend/src/routes/auth.ts`) so the user gets INSTANT, localized, inline
 * feedback under the offending field instead of a round-trip that surfaces a
 * raw English server string (or, on a version-skewed backend, nothing at all).
 *
 * Each function returns an **i18n key** (not resolved text) for the first
 * violation, so the logic stays pure/testable and the component resolves the
 * message with `useT()`. `null` / `{}` means valid.
 */

// Kept in sync with backend `RESERVED_USERNAMES`.
const RESERVED_USERNAMES = new Set(["admin", "root", "lumo", "support", "system"]);

/** First username-rule violation as an i18n key, or null when valid. */
export function validateUsername(username: string): string | null {
  if (username.length === 0) return "auth.err.usernameRequired";
  if (username.length < 3) return "auth.err.usernameShort";
  if (username.length > 32) return "auth.err.usernameLong";
  if (!/^[A-Za-z0-9_-]+$/.test(username)) return "auth.err.usernameChars";
  if (/^[-_]/.test(username) || /[-_]$/.test(username)) return "auth.err.usernameEdges";
  if (RESERVED_USERNAMES.has(username.toLowerCase())) return "auth.err.usernameReserved";
  return null;
}

/** First password-rule violation as an i18n key, or null when valid. */
export function validatePassword(password: string): string | null {
  if (password.length === 0) return "auth.err.passwordRequired";
  if (password.length < 8) return "auth.err.passwordShort";
  if (password.length > 256) return "auth.err.passwordLong";
  if (!(/[A-Za-z]/.test(password) && /\d/.test(password))) return "auth.err.passwordComplexity";
  return null;
}

/** Register-form validation → `{ field: i18nKey }` (empty object when all valid). */
export function validateRegister(input: {
  username: string;
  password: string;
  confirm: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const u = validateUsername(input.username);
  if (u) errors.username = u;
  const p = validatePassword(input.password);
  if (p) errors.password = p;
  // Only flag a mismatch once the password itself is otherwise valid, so the
  // user fixes the password first rather than seeing two errors at once.
  else if (input.confirm !== input.password) errors.confirm = "auth.err.confirmMismatch";
  return errors;
}

/** Sign-in validation → `{ field: i18nKey }`. Only presence is checked (the
 *  server is the authority on correctness — INVALID_CREDENTIALS). */
export function validateSignin(input: { username: string; password: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.username.length === 0) errors.username = "auth.err.usernameRequired";
  if (input.password.length === 0) errors.password = "auth.err.passwordRequired";
  return errors;
}
