/**
 * Pure ordering helpers for the Projects gallery (#211 V2 ⭐6).
 *
 * Kept component-free so the sort modes — and the "archived always sinks below
 * active regardless of mode" rule is not needed here because archived projects
 * are rendered in a separate section — are unit-testable without rendering.
 */

export type ProjectSort = "recent" | "name" | "progress";

interface SortableProject {
  id: string;
  name: string;
  updatedAt: string;
  pinned?: boolean;
}

/**
 * Return a new array ordered by the chosen mode:
 * - recent   → most recently updated first (updatedAt desc)
 * - name     → case-insensitive A→Z (locale-aware)
 * - progress → highest completion first, then most-recent as a tiebreak
 *
 * Pinned projects (#211 V2 ⭐6b) always float to the top, regardless of mode;
 * within the pinned and unpinned groups the chosen mode applies. `pct` resolves
 * a project's completion percentage (0–100) for progress mode. The input array
 * is never mutated.
 */
export function sortProjects<T extends SortableProject>(
  projects: T[],
  mode: ProjectSort,
  pct: (id: string) => number
): T[] {
  const byMode = (a: T, b: T): number => {
    switch (mode) {
      case "name":
        return a.name.localeCompare(b.name);
      case "progress": {
        const d = pct(b.id) - pct(a.id);
        return d !== 0 ? d : b.updatedAt.localeCompare(a.updatedAt);
      }
      case "recent":
      default:
        return b.updatedAt.localeCompare(a.updatedAt);
    }
  };
  return [...projects].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return byMode(a, b);
  });
}
