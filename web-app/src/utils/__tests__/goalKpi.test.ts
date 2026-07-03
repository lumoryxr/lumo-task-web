import { describe, it, expect } from "vitest";
import { isKpiGoal, goalPct, parseTarget, nextConfidence } from "@/utils/goalKpi";

describe("isKpiGoal", () => {
  it("is true only with a positive target", () => {
    expect(isKpiGoal({ text: "a", done: false, target: 100 })).toBe(true);
    expect(isKpiGoal({ text: "a", done: false, target: 0 })).toBe(false);
    expect(isKpiGoal({ text: "a", done: false })).toBe(false);
  });
});

describe("goalPct", () => {
  it("uses current/target for KPI goals, clamped 0–100", () => {
    expect(goalPct({ text: "a", done: false, target: 100, current: 42 })).toBe(42);
    expect(goalPct({ text: "a", done: false, target: 100, current: 0 })).toBe(0);
    expect(goalPct({ text: "a", done: false, target: 100, current: 250 })).toBe(100);
    expect(goalPct({ text: "a", done: false, target: 100 })).toBe(0); // no current → 0
  });

  it("falls back to the binary done state for plain goals", () => {
    expect(goalPct({ text: "a", done: true })).toBe(100);
    expect(goalPct({ text: "a", done: false })).toBe(0);
  });

  it("measures progress from a non-zero start baseline (start→target)", () => {
    // 20→100, currently 60 → (60-20)/(100-20) = 50%
    expect(goalPct({ text: "a", done: false, target: 100, start: 20, current: 60 })).toBe(50);
    // at the baseline → 0%
    expect(goalPct({ text: "a", done: false, target: 100, start: 20, current: 20 })).toBe(0);
    // no current defaults to the baseline → 0%
    expect(goalPct({ text: "a", done: false, target: 100, start: 20 })).toBe(0);
    // below baseline clamps to 0, past target clamps to 100
    expect(goalPct({ text: "a", done: false, target: 100, start: 20, current: 10 })).toBe(0);
    expect(goalPct({ text: "a", done: false, target: 100, start: 20, current: 999 })).toBe(100);
    // start === target: no range → reached only when current ≥ target
    expect(goalPct({ text: "a", done: false, target: 50, start: 50, current: 50 })).toBe(100);
    expect(goalPct({ text: "a", done: false, target: 50, start: 50, current: 40 })).toBe(0);
  });

  it("handles decreasing KRs (e.g. reduce 80 → 40)", () => {
    // 80→40, currently 60 → (60-80)/(40-80) = 50%
    expect(goalPct({ text: "a", done: false, target: 40, start: 80, current: 60 })).toBe(50);
    // still at the baseline → 0%
    expect(goalPct({ text: "a", done: false, target: 40, start: 80, current: 80 })).toBe(0);
    // worse than baseline clamps to 0; at/under target clamps to 100
    expect(goalPct({ text: "a", done: false, target: 40, start: 80, current: 90 })).toBe(0);
    expect(goalPct({ text: "a", done: false, target: 40, start: 80, current: 30 })).toBe(100);
  });
});

describe("nextConfidence", () => {
  it("starts unset goals at on_track, then cycles on_track → at_risk → off_track → on_track", () => {
    expect(nextConfidence(undefined)).toBe("on_track");
    expect(nextConfidence("on_track")).toBe("at_risk");
    expect(nextConfidence("at_risk")).toBe("off_track");
    expect(nextConfidence("off_track")).toBe("on_track");
  });
});

describe("parseTarget", () => {
  it("accepts positive numbers, rejects the rest", () => {
    expect(parseTarget("100")).toBe(100);
    expect(parseTarget(" 3.5 ")).toBe(3.5);
    expect(parseTarget("0")).toBeUndefined();
    expect(parseTarget("-5")).toBeUndefined();
    expect(parseTarget("abc")).toBeUndefined();
    expect(parseTarget("")).toBeUndefined();
  });
});
