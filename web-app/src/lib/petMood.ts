/**
 * Pet companion depth (#174 V1) — pure, framework-free logic so it is
 * unit-testable in isolation. Two pieces:
 *
 *  1. A gentle happiness meter that decays on inactivity and recovers on task
 *     completion. Deliberately non-punitive: it never drops below a floor, so
 *     the pet "droops" a little when you ghost it but never looks abandoned or
 *     guilt-trips you.
 *  2. Per-species personality copy + streak-milestone detection so choosing a
 *     species matters and a streak produces a distinct reaction.
 */
import type { PetSpecies } from "@/components/PetSvg";

// ── Happiness meter ───────────────────────────────────────────────────────────

export const HAPPINESS_MAX = 100;
/** Floor — the pet never sinks below "a bit wistful". Keeps it supportive. */
export const HAPPINESS_MIN = 40;
/** No decay for the first idle day (a grace period — life happens). */
export const GRACE_DAYS = 1;
/** Gentle: ~6 idle days past the grace day to fall from full to the floor. */
export const DECAY_PER_IDLE_DAY = 10;
/** Each completed task nudges happiness back up. */
export const GAIN_PER_COMPLETION = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

function clampHappiness(v: number): number {
  return Math.max(HAPPINESS_MIN, Math.min(HAPPINESS_MAX, v));
}

/**
 * Happiness after `now`, given the last stored value + when the pet last saw
 * activity. Whole idle days beyond the grace period each shed DECAY_PER_IDLE_DAY.
 * Pure: does not mutate; callers persist the result.
 */
export function decayHappiness(stored: number, lastActivityAt: number, now: number): number {
  const idleDays = Math.floor((now - lastActivityAt) / DAY_MS);
  const decayDays = Math.max(0, idleDays - GRACE_DAYS);
  return clampHappiness(stored - decayDays * DECAY_PER_IDLE_DAY);
}

/** Happiness after completing a task (applied on top of the decayed value). */
export function gainHappiness(current: number): number {
  return clampHappiness(current + GAIN_PER_COMPLETION);
}

export type HappinessBucket = "thriving" | "content" | "wistful";

export function happinessBucket(h: number): HappinessBucket {
  if (h >= 80) return "thriving";
  if (h >= 55) return "content";
  return "wistful";
}

// ── Streak milestones ─────────────────────────────────────────────────────────

/** Streak lengths that earn a distinct celebration (not every day). */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365];

export function isStreakMilestone(streak: number): boolean {
  return STREAK_MILESTONES.includes(streak);
}

// ── Per-species personality copy ──────────────────────────────────────────────

/** A moment the pet reacts to. Keys resolve through the i18n dict. */
export type PetLineEvent = "celebrate" | "wistful" | "streak";

/**
 * i18n key for a species-flavoured line, e.g. `pet.line.fox.celebrate`. Each
 * species has its own tone (see the dict), so the choice of companion is felt.
 * Registered as the `pet.line.` dynamic key family in the i18n guard.
 */
export function petLineKey(species: PetSpecies, event: PetLineEvent): string {
  return `pet.line.${species}.${event}`;
}
