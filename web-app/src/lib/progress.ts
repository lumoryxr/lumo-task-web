import type { Subtask } from "@/types/task";

/** One-click stops offered by the progress editor: not started → done. */
export const PROGRESS_PRESETS = [0, 25, 50, 75, 100] as const;

/** Normalize any input to the contract's whole-number 0..100 percent. */
export function clampProgress(value: number | undefined | null): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Share of completed subtasks as a percent, or null when there are none. */
export function progressFromSubtasks(subtasks: Subtask[] | undefined): number | null {
  if (!subtasks || subtasks.length === 0) return null;
  const done = subtasks.filter((s) => s.completed).length;
  return clampProgress((done / subtasks.length) * 100);
}
