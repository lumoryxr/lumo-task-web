/**
 * Symmetric encryption for secrets stored at rest (AI provider keys, remote sync
 * tokens). AES-256-GCM with a key derived from LUMO_ENCRYPTION_KEY. Values are
 * stored as "enc:v1:<iv>.<tag>.<ciphertext>" (base64 parts). Legacy plaintext
 * values (written before encryption existed) pass through decryptSecret
 * unchanged and are re-stored as ciphertext on the next write.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const PREFIX = "enc:v1:";

const MIN_KEY_BYTES = 32;

function key(): Buffer {
  const raw = process.env.LUMO_ENCRYPTION_KEY;
  if (!raw) throw new Error("LUMO_ENCRYPTION_KEY must be set");
  // Reject low-entropy keys in every environment — a weak passphrase makes the
  // at-rest AES key dictionary-attackable if the DB leaks.
  if (Buffer.byteLength(raw, "utf8") < MIN_KEY_BYTES) {
    throw new Error(`LUMO_ENCRYPTION_KEY must be at least ${MIN_KEY_BYTES} bytes`);
  }
  // Derive a fixed 32-byte AES key from the configured secret (SHA-256 keeps the
  // derivation stable so existing ciphertext stays decryptable).
  return createHash("sha256").update(raw, "utf8").digest();
}

/** Encrypt a non-empty string. Empty values and already-encrypted values pass through. */
export function encryptSecret(plain: string): string {
  if (!plain) return plain;
  if (plain.startsWith(PREFIX)) return plain; // idempotent
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map((b) => b.toString("base64")).join(".");
}

/** Decrypt a value from encryptSecret. Legacy plaintext (no prefix) passes through. */
export function decryptSecret(value: string | null | undefined): string {
  if (!value || !value.startsWith(PREFIX)) return value ?? "";
  const [ivB, tagB, ctB] = value.slice(PREFIX.length).split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]).toString("utf8");
}

/** Whether a stored value is already in encrypted form. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}
