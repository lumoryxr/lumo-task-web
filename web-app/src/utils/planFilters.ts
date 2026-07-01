/**
 * Pure helpers for the Today plan filter bars (#205 tags, #223 V2 ⭐2 projects).
 *
 * Kept side-effect-free and component-free so the "distinct options" and
 * "conjunctive filter" rules — including auto-dropping a stale filter so the
 * list never gets stuck empty — are unit-testable without rendering the page.
 */

interface FilterableTask {
  project_id?: string | null;
  tags?: string[];
}

interface ProjectLike {
  id: string;
  name: string;
}

export interface PlanProjectOption {
  id: string;
  name: string;
}

/** Distinct projects referenced by the given tasks, resolved to display names. */
export function derivePlanProjects(tasks: FilterableTask[], projects: ProjectLike[]): PlanProjectOption[] {
  const ids = [...new Set(tasks.map((t) => t.project_id).filter((id): id is string => !!id))];
  return ids
    .map((id) => ({ id, name: projects.find((p) => p.id === id)?.name ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve the effective filter: a requested value is kept only if it still
 * matches one of the available options, else it's dropped (→ null). This is
 * what prevents an emptied filter (its last task completed) from stranding the
 * user on a blank list with no way back.
 */
export function resolveActiveFilter(requested: string | null, available: string[]): string | null {
  return requested && available.includes(requested) ? requested : null;
}

/** Apply the (optional) tag and project filters conjunctively. */
export function filterPlanTasks<T extends FilterableTask>(
  tasks: T[],
  activeTag: string | null,
  activeProject: string | null
): T[] {
  return tasks.filter(
    (t) =>
      (!activeTag || (t.tags ?? []).includes(activeTag)) &&
      (!activeProject || t.project_id === activeProject)
  );
}
