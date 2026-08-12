import { z } from "zod";

/**
 * Countdown contract — the `/v1/countdowns` list-response envelope.
 *
 * Scope (see #439): only the paginated LIST response is owned here, bringing
 * countdowns onto the shared keyset `{ items, nextCursor }` shape alongside
 * people/projects/tasks/completed. The request bodies stay route-local (matching
 * the projects precedent), so this file intentionally does NOT define the
 * create/update bodies — only the wire item and the list envelope.
 *
 * Lenient on read (plain strings for the enum-like fields) to tolerate legacy
 * rows, exactly like PersonWireSchema; the frontend adapter re-narrows these to
 * the stricter `CountdownEvent` view (CountdownColor/Repeat/Calendar unions).
 */

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

export type CountdownWire = z.infer<typeof CountdownWireSchema>;
export type CountdownListResponse = z.infer<typeof CountdownListResponseSchema>;
