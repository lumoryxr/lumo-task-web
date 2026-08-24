import { z } from "zod";

/**
 * Countdown contract — the `/v1/countdowns` list-response envelope.
 *
 * Owns the full protocol: the create/update/migrate request bodies AND the wire
 * item + paginated list envelope. (The bodies were previously route-local; they
 * moved here so the countdown grammar — colors, repeat rule, solar/lunar
 * calendar — is visible to the frontend and to the generated OpenAPI document.)
 *
 * Lenient on read (plain strings for the enum-like fields) to tolerate legacy
 * rows, exactly like PersonWireSchema; the frontend adapter re-narrows these to
 * the stricter `CountdownEvent` view (CountdownColor/Repeat/Calendar unions).
 */

// ── Field vocabularies ────────────────────────────────────────────────────────

export const CountdownColorSchema = z.enum(["green", "cyan", "amber", "red"]);
export const CountdownRepeatSchema = z.enum(["none", "yearly"]);

/**
 * Which calendar the user authored the date in. `date` is ALWAYS a solar
 * (Gregorian) ISO anchor; this flag only records the authoring calendar, which
 * affects display and how a `yearly` repeat is projected forward.
 */
export const CountdownCalendarSchema = z.enum(["solar", "lunar"]);

// ── Request bodies ────────────────────────────────────────────────────────────

export const CountdownCreateBodySchema = z.object({
  /** Optional client-generated id (offline-first, ADR-0003 Phase 4). */
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  title: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  emoji: z.string().max(10).optional().nullable(),
  color: CountdownColorSchema.default("green"),
  repeat: CountdownRepeatSchema.default("none"),
  note: z.string().max(2000).optional().nullable(),
  calendar: CountdownCalendarSchema.default("solar"),
});

export const CountdownUpdateBodySchema = CountdownCreateBodySchema.partial();

/** Bulk-import cap — bounds memory/CPU for a single /migrate call. */
export const MIGRATE_MAX_COUNTDOWNS = 10_000;

export const CountdownMigrateBodySchema = z.object({
  events: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        title: z.string().min(1).max(200),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        emoji: z.string().max(10).optional().nullable(),
        color: CountdownColorSchema,
        repeat: CountdownRepeatSchema,
        note: z.string().optional().nullable(),
        calendar: CountdownCalendarSchema.default("solar"),
        createdAt: z.string(),
      }),
    )
    .max(MIGRATE_MAX_COUNTDOWNS),
});

export const CountdownMigrateResponseSchema = z.object({
  ok: z.literal(true),
  migrated: z.number(),
});

// ── Wire item ─────────────────────────────────────────────────────────────────
// Mirrors the backend's rowToEvent(): note the camelCase `createdAt`, and that
// `emoji`/`note` are omitted (undefined) rather than null when unset.

export const CountdownWireSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(),
  emoji: z.string().nullish(),
  color: z.string(),
  repeat: z.string(),
  note: z.string().nullish(),
  calendar: z.string(),
  createdAt: z.string(),
});

// ── Paginated list response ───────────────────────────────────────────────────
// GET /countdowns returns a keyset-paginated envelope: a page of items plus the
// cursor to fetch the next page (null on the last page).

export const CountdownListResponseSchema = z.object({
  items: z.array(CountdownWireSchema),
  nextCursor: z.string().nullable(),
});

// ── Inferred wire types ───────────────────────────────────────────────────────

export type CountdownColor = z.infer<typeof CountdownColorSchema>;
export type CountdownRepeat = z.infer<typeof CountdownRepeatSchema>;
export type CountdownCalendar = z.infer<typeof CountdownCalendarSchema>;
export type CountdownCreateInput = z.input<typeof CountdownCreateBodySchema>;
export type CountdownUpdateInput = z.input<typeof CountdownUpdateBodySchema>;
export type CountdownMigrateInput = z.input<typeof CountdownMigrateBodySchema>;
export type CountdownWire = z.infer<typeof CountdownWireSchema>;
export type CountdownListResponse = z.infer<typeof CountdownListResponseSchema>;
