import { describe, it, expect } from "vitest";
import { computeProjectRecap } from "@/utils/projectRecap";

const proj = (goals: { done: boolean }[]) => ({ goals });

describe("computeProjectRecap", () => {
  it("aggregates done/active/total and progress %", () => {
    const r = computeProjectRecap(proj([{ done: true }, { done: false }]), 3, 1, 120);
    expect(r.tasksCompleted).toBe(3);
    expect(r.activeTasks).toBe(1);
    expect(r.totalTasks).toBe(4);
    expect(r.progressPct).toBe(75);
    expect(r.focusMinutes).toBe(120);
    expect(r.goalsDone).toBe(1);
    expect(r.goalsTotal).toBe(2);
  });

  it("progress is 0 (not NaN) when there are no tasks", () => {
    const r = computeProjectRecap(proj([]), 0, 0, 0);
    expect(r.progressPct).toBe(0);
    expect(r.totalTasks).toBe(0);
    expect(r.goalsTotal).toBe(0);
  });

  it("rounds progress to the nearest integer", () => {
    // 1 of 3 done → 33.33% → 33
    expect(computeProjectRecap(proj([]), 1, 2, 0).progressPct).toBe(33);
  });
});
