/**
 * Streak-milestone celebration gating (Phase-3 growth, #192).
 *
 * When a user's daily-completion streak reaches a milestone we surface a
 * one-tap shareable card — once per milestone per user. Crossing several
 * milestones at once (e.g. an imported history) celebrates only the highest
 * un-celebrated one, so we congratulate the most impressive number rather than
 * spamming a stack of cards.
 */

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365] as const;

function key(userId: string, milestone: number): string {
  return `lumo.streak.${userId}.${milestone}`;
}

/** Has this user already seen the celebration for this milestone? */
export function hasCelebratedStreakMilestone(userId: string, milestone: number): boolean {
  try {
    return localStorage.getItem(key(userId, milestone)) !== null;
  } catch {
    return false;
  }
}

/** Persist that this user has now seen the milestone celebration. */
export function markStreakMilestoneCelebrated(userId: string, milestone: number): void {
  try {
    localStorage.setItem(key(userId, milestone), "1");
  } catch {
    // localStorage unavailable (private mode / quota) — degrade to re-showing.
  }
}

/**
 * The milestone to celebrate now, or `null`. We look only at the **highest**
 * milestone `<= streak` and celebrate it if the user hasn't seen it yet. We
 * deliberately never backfill lower milestones — a user first observed at a
 * 100-day streak gets the 100 card, not a stack ending at 3, and once a
 * milestone is shown we don't drop back to a smaller one on the next visit.
 */
export function pendingStreakMilestone(userId: string, streak: number): number | null {
  if (!userId || streak <= 0) return null;
  let highest: number | null = null;
  for (const m of STREAK_MILESTONES) {
    if (streak >= m) highest = m; // ascending list → last qualifying is the highest
  }
  if (highest === null) return null;
  return hasCelebratedStreakMilestone(userId, highest) ? null : highest;
}
