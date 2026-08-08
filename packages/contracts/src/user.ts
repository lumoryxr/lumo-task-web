import { z } from "zod";

/**
 * User contract — the single source of truth for the `/v1/user` protocol:
 *   • GET    /v1/user         → UserProfileWire (profile + usage stats)
 *   • GET    /v1/user/export  → DataExportWire  (GDPR/CCPA self-service export)
 *   • DELETE /v1/user         → DeleteAccountResponse (right-to-erasure)
 *
 * The profile shape formalizes what `backend/src/routes/user.ts` already
 * returned; the export + delete shapes are added for the data-ownership
 * controls a public launch requires. The backend types its responses against
 * these and a conformance test parses real responses with them, so the docs
 * and the implementation cannot drift.
 */

// ── GET /v1/user ──────────────────────────────────────────────────────────────

export const UserProfileWireSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  initials: z.string(),
  /** True for a local-only (Electron, no cloud account) user. */
  local: z.boolean(),
  plan: z.string(),
  renewsAt: z.string().nullable(),
  stats: z.object({
    tasks: z.number(),
    pomodoros: z.number(),
    syncOK: z.boolean(),
  }),
});

// ── GET /v1/user/export ───────────────────────────────────────────────────────
// A GDPR/CCPA "download my data" bundle. Each domain is exported as an array of
// open records (the raw, secret-free DB rows) rather than a tightly-pinned row
// schema on purpose: an additive column change (the app gains new fields often)
// must not break the export contract or drop the user's data. The envelope
// itself — version, timestamp, scrubbed user identity, and the set of
// collections — is what the contract pins.
//
// Secret-bearing fields are NEVER exported: the settings row is scrubbed of AI
// keys / sync tokens (a boolean flag replaces them), and the user identity omits
// password_hash and the calendar-feed tokens (see backend/src/routes/user.ts).

const ExportRowSchema = z.record(z.string(), z.unknown());

export const ExportUserIdentitySchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  initials: z.string(),
  plan: z.string(),
  created_at: z.string(),
});

export const DataExportWireSchema = z.object({
  /** Bump when the bundle shape changes incompatibly. */
  format_version: z.literal(1),
  /** ISO-8601 server timestamp of when the export was produced. */
  exported_at: z.string(),
  user: ExportUserIdentitySchema,
  settings: ExportRowSchema.nullable(),
  tasks: z.array(ExportRowSchema),
  completed: z.array(ExportRowSchema),
  people: z.array(ExportRowSchema),
  habits: z.array(ExportRowSchema),
  habit_logs: z.array(ExportRowSchema),
  countdowns: z.array(ExportRowSchema),
  projects: z.array(ExportRowSchema),
  templates: z.array(ExportRowSchema),
});

// ── DELETE /v1/user ───────────────────────────────────────────────────────────
// Irreversible account erasure: removes every row the user owns across all
// domains plus the account itself. Acknowledges the write; the caller's tokens
// become invalid immediately (the user row is gone, so auth lookups fail).

export const DeleteAccountResponseSchema = z.object({
  ok: z.literal(true),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type UserProfileWire = z.infer<typeof UserProfileWireSchema>;
export type ExportUserIdentity = z.infer<typeof ExportUserIdentitySchema>;
export type DataExportWire = z.infer<typeof DataExportWireSchema>;
export type DeleteAccountResponse = z.infer<typeof DeleteAccountResponseSchema>;
