/**
 * Centralized secret strength policy (issue #49).
 *
 * Used by lib/jwt.ts, lib/crypto.ts, and the boot check in index.ts so a weak,
 * blank, or placeholder secret fails FAST (at boot) in every environment,
 * rather than 500ing live traffic on first use.
 */

const MIN_BYTES = 32;

// Values shipped in .env.example / docs / old dev defaults — never valid.
const PLACEHOLDERS = new Set([
  "change-me-in-production",
  "change-me-in-production-use-32+-random-bytes",
  "dev-secret-change-in-production",
  "dev-secret",
]);

/**
 * Validate one secret. Returns it when strong; throws with a clear, secret-free
 * message otherwise. Rejects: missing, blank/whitespace-only, < 32 bytes, and
 * known example placeholders.
 */
export function assertStrongSecret(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} must be set`);
  if (value.trim().length === 0) throw new Error(`${name} must not be blank/whitespace`);
  // Placeholder check before length so a known placeholder always gets the clear
  // "placeholder" message (some placeholders are also < 32 bytes).
  if (PLACEHOLDERS.has(value.trim())) {
    throw new Error(`${name} must not be the example placeholder — set a real secret`);
  }
  if (Buffer.byteLength(value, "utf8") < MIN_BYTES) {
    throw new Error(`${name} must be at least ${MIN_BYTES} bytes`);
  }
  return value;
}

/** Boot-time validation of all required secrets. Throws on the first weak one. */
export function validateStartupSecrets(): void {
  assertStrongSecret("LUMO_JWT_SECRET", process.env.LUMO_JWT_SECRET);
  assertStrongSecret("LUMO_ENCRYPTION_KEY", process.env.LUMO_ENCRYPTION_KEY);
}
