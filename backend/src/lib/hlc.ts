/**
 * Hybrid Logical Clock (HLC) — P1a sync (ADR-0004 Addendum, 2026-06-26).
 *
 * Representation: an ISO-8601 UTC timestamp with SIX fractional-second digits,
 * e.g. `2026-06-26T10:53:34.326001Z`. The first three fractional digits hold
 * physical time (the millisecond field from `Date.now()`); the last three hold a
 * logical counter (000–999) that advances when two writes land in the same
 * millisecond.
 *
 * Why this shape:
 *  - Lexicographic string order == chronological order, so a plain string
 *    comparison is a valid total order for LWW and for the sync cursor.
 *  - It remains a syntactically valid ISO timestamp: a frontend parsing it via
 *    `new Date(s)` simply truncates the sub-millisecond counter — no crash, no
 *    special handling needed.
 *  - Wall-clock is NOT trusted for ordering between two writes in the same ms;
 *    the logical counter breaks ties and guarantees monotonicity even when the
 *    physical clock stalls or moves backwards.
 *
 * `now()` is monotonic: it never returns a value <= the previous one it
 * returned, even if `Date.now()` returns an equal or smaller value than before.
 */

/** The smallest possible HLC — the default `since` cursor for a full pull. */
export const MIN_HLC = "1970-01-01T00:00:00.000000Z";

const MAX_COUNTER = 999;

// Persisted clock state. `lastPhysical` is the last physical ms we emitted at;
// `lastCounter` is the logical counter at that physical time.
let lastPhysical = 0;
let lastCounter = 0;

/**
 * Format a physical millisecond value + a logical counter as the HLC string.
 * Both the millisecond (000–999) and the counter (000–999) are zero-padded to
 * exactly three digits so the result is always lexicographically sortable.
 */
export function format(physicalMs: number, counter: number): string {
  // `Date#toISOString()` gives `...THH:MM:SS.mmmZ` (3 fractional digits). We
  // replace the trailing `mmmZ` with `mmm<counter>Z` to append the counter.
  const iso = new Date(physicalMs).toISOString(); // e.g. 2026-06-26T10:53:34.326Z
  const ctr = String(counter).padStart(3, "0");
  return iso.replace(/Z$/, `${ctr}Z`);
}

/**
 * Return the next monotonic HLC.
 *
 * @param physicalNow injectable wall clock (defaults to `Date.now()`); tests
 *   pass equal/backward values to prove monotonicity.
 */
export function now(physicalNow: number = Date.now()): string {
  if (physicalNow > lastPhysical) {
    // Physical clock advanced — reset the logical counter.
    lastPhysical = physicalNow;
    lastCounter = 0;
    return format(lastPhysical, lastCounter);
  }

  // Physical clock equal or behind — advance the logical counter instead so we
  // never emit a value <= the previous one. On counter overflow, carry into the
  // next millisecond (which keeps the string strictly increasing).
  lastCounter += 1;
  if (lastCounter > MAX_COUNTER) {
    lastPhysical += 1;
    lastCounter = 0;
  }
  return format(lastPhysical, lastCounter);
}

/** Total-order comparison of two HLC strings: <0, 0, or >0. Pure string compare. */
export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Test-only: reset the internal clock state so a test process starts from a
 * known baseline. Not used by production code.
 */
export function __resetForTest(): void {
  lastPhysical = 0;
  lastCounter = 0;
}
