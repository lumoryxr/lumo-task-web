import type { ProjectGoal, GoalConfidence } from "@/types/task";

/** A goal is a numeric KPI once it has a positive target (e.g. sales 42/100). */
export function isKpiGoal(g: ProjectGoal): boolean {
  return typeof g.target === "number" && g.target > 0;
}

/** OKR check-in states in the order the pill cycles through them. */
export const CONFIDENCE_ORDER: GoalConfidence[] = ["on_track", "at_risk", "off_track"];

/** Next confidence when the pill is clicked: unset → on_track, then cycle. */
export function nextConfidence(cur: GoalConfidence | undefined): GoalConfidence {
  if (cur === undefined) return "on_track";
  return CONFIDENCE_ORDER[(CONFIDENCE_ORDER.indexOf(cur) + 1) % CONFIDENCE_ORDER.length];
}

/**
 * Completion percentage (0–100). For a KPI goal it's progress from the baseline
 * (`start`, default 0) toward `target`, clamped; for a plain goal it's the
 * binary done state. Measuring start→target lets a KR that already sits at 20
 * on the way to 100 read 0% at the start instead of 20%. The formula also
 * handles decreasing KRs (e.g. "reduce bugs 80→50") since (cur-start)/(target-
 * start) stays correct when the span is negative.
 */
export function goalPct(g: ProjectGoal): number {
  if (!isKpiGoal(g)) return g.done ? 100 : 0;
  const target = g.target as number;
  const start = g.start ?? 0;
  const cur = g.current ?? start;
  const span = target - start;
  // start === target: no range to progress along → reached-or-not.
  if (span === 0) return cur >= target ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((cur - start) / span) * 100)));
}

/** Parse a raw target string into a valid positive number, or undefined. */
export function parseTarget(raw: string): number | undefined {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
