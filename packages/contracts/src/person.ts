import { z } from "zod";

/**
 * Person contract — single source of truth for the `/v1/people` protocol.
 *
 * Mirrors the Task domain pattern: request-body schemas (what clients send,
 * validated at the route boundary) plus a wire-response schema (exactly what the
 * backend returns). The frontend re-exports the normalized `Person` view; the
 * adapter in web-app/src/api/client.ts maps the wire `email: string | null` to
 * the view's `email?: string`.
 */

// ── Request bodies ────────────────────────────────────────────────────────────

export const PersonCreateBodySchema = z.object({
  // Optional client-generated id (offline-first, ADR-0003 Phase 4).
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  name: z.string().min(1).max(100),
  initials: z.string().min(1).max(2),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  email: z.string().email().max(255).nullable().optional(),
});

export const PersonUpdateBodySchema = PersonCreateBodySchema.partial();

// ── Wire response ─────────────────────────────────────────────────────────────
// Lenient on read (plain strings) to tolerate legacy rows; strict on write above.

export const PersonWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  initials: z.string(),
  color: z.string(),
  email: z.string().nullable(),
  created_at: z.string(),
});

// ── Paginated list response ───────────────────────────────────────────────────
// GET /people returns a keyset-paginated envelope: a page of items plus the
// cursor to fetch the next page (null on the last page).

export const PersonListResponseSchema = z.object({
  items: z.array(PersonWireSchema),
  nextCursor: z.string().nullable(),
});

// ── Inferred request/wire types ───────────────────────────────────────────────

export type PersonCreateInput = z.input<typeof PersonCreateBodySchema>;
export type PersonUpdateInput = z.input<typeof PersonUpdateBodySchema>;
export type PersonWire = z.infer<typeof PersonWireSchema>;
export type PersonListResponse = z.infer<typeof PersonListResponseSchema>;

// ── Normalized client view (re-exported by web-app/src/types) ─────────────────

export interface Person {
  id: string;
  name: string;
  /** 1–2 character initials shown in the avatar bubble. */
  initials: string;
  /** Hex color for the avatar background. */
  color: string;
  email?: string;
}
