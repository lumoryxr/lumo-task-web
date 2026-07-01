/**
 * Pure aggregation for a project's shareable recap (#211 V2 ⭐5).
 *
 * Kept component-free so the numbers — done/total, progress %, goal completion —
 * are unit-testable without rendering the card.
 */

interface RecapProject {
  goals: { done: boolean }[];
}

export interface ProjectRecap {
  tasksCompleted: number;
  activeTasks: number;
  totalTasks: number;
  progressPct: number;
  focusMinutes: number;
  goalsDone: number;
  goalsTotal: number;
}

/**
 * @param doneCount   completed tasks snapshotted to the project
 * @param activeTasks still-open tasks currently filed under it
 * @param focusMinutes total completed focus minutes for the project
 */
export function computeProjectRecap(
  project: RecapProject,
  doneCount: number,
  activeTasks: number,
  focusMinutes: number
): ProjectRecap {
  const totalTasks = doneCount + activeTasks;
  return {
    tasksCompleted: doneCount,
    activeTasks,
    totalTasks,
    progressPct: totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0,
    focusMinutes,
    goalsDone: project.goals.filter((g) => g.done).length,
    goalsTotal: project.goals.length,
  };
}
