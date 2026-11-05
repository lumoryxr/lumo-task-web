import { describe, it, expect } from "vitest";
import { clampProgress, progressFromSubtasks, PROGRESS_PRESETS } from "../progress";

describe("clampProgress", () => {
  it("rounds to a whole percent", () => {
    expect(clampProgress(33.4)).toBe(33);
    expect(clampProgress(33.6)).toBe(34);
  });

  it("clamps to 0..100", () => {
    expect(clampProgress(-5)).toBe(0);
    expect(clampProgress(140)).toBe(100);
  });

  it("treats missing or non-numeric input as 0", () => {
    expect(clampProgress(undefined)).toBe(0);
    expect(clampProgress(Number.NaN)).toBe(0);
  });
});

describe("progressFromSubtasks", () => {
  it("is null when there are no subtasks", () => {
    expect(progressFromSubtasks(undefined)).toBeNull();
    expect(progressFromSubtasks([])).toBeNull();
  });

  it("is the share of completed subtasks, rounded", () => {
    const s = (completed: boolean, i: number) => ({ id: String(i), title: "x", completed });
    expect(progressFromSubtasks([true, false, false].map(s))).toBe(33);
    expect(progressFromSubtasks([true, true, false, false].map(s))).toBe(50);
    expect(progressFromSubtasks([true, true].map(s))).toBe(100);
  });
});

describe("PROGRESS_PRESETS", () => {
  it("covers not started through done in quarter steps", () => {
    expect(PROGRESS_PRESETS).toEqual([0, 25, 50, 75, 100]);
  });
});
