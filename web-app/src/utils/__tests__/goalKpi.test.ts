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
