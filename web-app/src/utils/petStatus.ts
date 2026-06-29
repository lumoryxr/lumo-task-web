import type { CompletedEntry } from "@/types/task";

/**
 * Pet companion productivity awareness (#174 v2). The pet's voice reflects the
 * user's *real* recent productivity: an active streak ("thriving"), a win today
 * ("today"), or a gentle come-back nudge after a couple of idle days. When there
 * is no strong signal, `key` is null and the caller falls back to the pet's
 * normal species greeting — so the companion notices effort and lapses without
 * nagging.
 */
export interface PetStatus {
  /** i18n key for the status message, or null to fall back to the greeting. */
  key: string | null;
  /** Current completion streak, for `{n}` interpolation in the message. */
  streak: number;
}

function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Derive the pet's productivity status from the completed-entries history, the
 * current streak, and the current time. Pure + deterministic for testing.
 */
export function petStatusFromEntries(
  entries: CompletedEntry[],
  streak: number,
  now: Date,
): PetStatus {
  const todayMs = startOfDayMs(now);
  let completedToday = 0;
  let lastMs: number | null = null;
  for (const e of entries) {
    if (!e.completedAt) continue;
    const d = new Date(e.completedAt);
    if (startOfDayMs(d) === todayMs) completedToday++;
    const ms = d.getTime();
    if (lastMs === null || ms > lastMs) lastMs = ms;
  }
  const daysSinceLast =
    lastMs === null ? null : Math.floor((todayMs - startOfDayMs(new Date(lastMs))) / 86_400_000);

  // Lapsed for 2+ days → a warm come-back nudge (streak is already broken here).
  if (daysSinceLast !== null && daysSinceLast >= 2) return { key: "pet.status.comeback", streak };
  // An active multi-day streak → celebrate it.
  if (streak >= 3) return { key: "pet.status.thriving", streak };
  // A win today, early in a streak → encouraging acknowledgement.
  if (completedToday > 0) return { key: "pet.status.today", streak };
  // No strong signal → caller uses the normal species greeting.
  return { key: null, streak };
}
