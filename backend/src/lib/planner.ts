/**
 * Pure task-selection logic for `generate_today_plan` (#172 V1 — time-budgeted
 * planning). Kept free of any HTTP/DB so it is unit-testable in isolation: the
 * AI tool executor fetches the candidate tasks, calls `selectTodayPlan`, then
 * PATCHes the chosen ones onto today.
 */

export interface PlanCandidate {
  id: string;
  quadrant: string;
  /** Estimated minutes; 0/undefined means "unset" and falls back to a default. */
  duration?: number;
  /** ISO date string or null. */
  due?: string | null;
}

/** Fallback estimate for a task with no explicit duration, so a budget stays meaningful. */
export const DEFAULT_TASK_MINUTES = 30;

/** Estimated minutes a task consumes against a time budget. */
export function planTaskMinutes(task: Pick<PlanCandidate, "duration">): number {
  const d = task.duration ?? 0;
  return d > 0 ? d : DEFAULT_TASK_MINUTES;
}

const PRIORITY = ["Q1", "Q2", "Q3", "Q4", "unclassified"];

/** Priority order (Q1 first), then earliest due date, then stable. */
function byPriorityThenDue(a: PlanCandidate, b: PlanCandidate): number {
  const pa = PRIORITY.indexOf(a.quadrant);
  const pb = PRIORITY.indexOf(b.quadrant);
  // Unknown quadrants sort last (indexOf → -1 would sort first, so normalise).
  const na = pa === -1 ? PRIORITY.length : pa;
  const nb = pb === -1 ? PRIORITY.length : pb;
  if (na !== nb) return na - nb;
  if (a.due && b.due) return a.due.localeCompare(b.due);
  if (a.due) return -1;
  if (b.due) return 1;
  return 0;
}

/**
 * Pick tasks for today from `candidates` (already filtered to not-today,
 * not-completed) by priority, capped at `maxTasks`. When `availableHours` is a
 * positive number, the total estimated minutes of the picked tasks never
 * exceeds the budget: greedy in priority order, a task that would overflow the
 * remaining budget is skipped so a smaller lower-priority task can still fit.
 * With no budget, behaviour is the original "top N by priority".
 */
export function selectTodayPlan(
  candidates: PlanCandidate[],
  opts: { maxTasks: number; availableHours?: number | null },
): PlanCandidate[] {
  const sorted = [...candidates].sort(byPriorityThenDue);
  const budgetMin =
    opts.availableHours != null && Number.isFinite(opts.availableHours) && opts.availableHours > 0
      ? opts.availableHours * 60
      : null;

  const chosen: PlanCandidate[] = [];
  let usedMin = 0;
  for (const t of sorted) {
    if (chosen.length >= opts.maxTasks) break;
    if (budgetMin != null) {
      const cost = planTaskMinutes(t);
      if (usedMin + cost > budgetMin) continue;
      usedMin += cost;
    }
    chosen.push(t);
  }
  return chosen;
}
