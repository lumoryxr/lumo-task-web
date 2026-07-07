import type { ImportedEvent } from "@/lib/icsParse";

/**
 * Total hours of imported calendar events that fall within *today* (local day),
 * used for calendar-aware "plan my day" (#172 V2): the backend subtracts this
 * from the user's stated available hours so a plan is sized to the time actually
 * free.
 *
 * - All-day events are excluded — they don't consume schedulable hours.
 * - Each timed event contributes only the portion that overlaps today, so a
 *   meeting spanning midnight isn't double-counted.
 * - Malformed / zero-length events are ignored.
 * - Result is clamped to [0, 24] (matches the backend's accepted bound).
 */
export function todayBusyHours(events: ImportedEvent[], now: Date = new Date()): number {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  let overlapMs = 0;
  for (const ev of events) {
    if (ev.isAllDay) continue;
    const start = Date.parse(ev.startISO);
    const end = Date.parse(ev.endISO);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const overlap = Math.min(end, dayEnd) - Math.max(start, dayStart);
    if (overlap > 0) overlapMs += overlap;
  }

  const hours = overlapMs / (60 * 60 * 1000);
  return Math.max(0, Math.min(24, hours));
}
