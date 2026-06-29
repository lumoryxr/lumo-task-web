import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getISOWeekKey,
  shouldShowWrapped,
  markWrappedShown,
  computePrevWeekStats,
  computeMonthStats,
  shouldShowMonthlyWrapped,
  markMonthlyWrappedShown,
} from "../wrapped";
import type { CompletedEntry } from "@/types/task";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

// 2024-01-15 is a Monday — previous week is Jan 7 (Sun) – Jan 13 (Sat)
const MONDAY = new Date("2024-01-15T10:00:00");

function makeEntry(overrides: Partial<CompletedEntry> = {}): CompletedEntry {
  return {
    id: Math.random().toString(),
    title: { en: "Task", zh: "任务" },
    duration: 25,
    completedAt: "2024-01-08T10:00:00", // Monday of prev week
    ...overrides,
  };
}

describe("getISOWeekKey", () => {
  it("returns correct key for a known Monday", () => {
    // 2024-01-08 is Monday of ISO Week 2
    expect(getISOWeekKey(new Date("2024-01-08"))).toBe("2024-W02");
  });

  it("returns correct key for a Sunday within the same ISO week", () => {
    // 2024-01-14 is Sunday of ISO Week 2
    expect(getISOWeekKey(new Date("2024-01-14"))).toBe("2024-W02");
  });

  it("handles year-boundary week correctly", () => {
    // 2024-01-01 is ISO Week 1 of 2024
    expect(getISOWeekKey(new Date("2024-01-01"))).toBe("2024-W01");
  });
});

describe("shouldShowWrapped", () => {
  it("returns false on Tuesday", () => {
    vi.setSystemTime(new Date("2024-01-09T10:00:00")); // Tuesday
    expect(shouldShowWrapped("u1")).toBe(false);
  });

  it("returns false on Wednesday", () => {
    vi.setSystemTime(new Date("2024-01-10T10:00:00")); // Wednesday
    expect(shouldShowWrapped("u1")).toBe(false);
  });

  it("returns true on Monday if not shown this week", () => {
    vi.setSystemTime(new Date("2024-01-08T10:00:00")); // Monday
    expect(shouldShowWrapped("u1")).toBe(true);
  });

  it("returns false on Monday after being shown", () => {
    vi.setSystemTime(new Date("2024-01-08T10:00:00")); // Monday
    markWrappedShown("u1");
    expect(shouldShowWrapped("u1")).toBe(false);
  });

  it("is per-user (different users get independent state)", () => {
    vi.setSystemTime(new Date("2024-01-08T10:00:00"));
    markWrappedShown("u1");
    expect(shouldShowWrapped("u2")).toBe(true);
  });
});

describe("markWrappedShown", () => {
  it("persists across calls within the same week", () => {
    vi.setSystemTime(new Date("2024-01-08T10:00:00"));
    markWrappedShown("u1");
    vi.setSystemTime(new Date("2024-01-08T14:00:00")); // later same day
    expect(shouldShowWrapped("u1")).toBe(false);
  });
});

describe("computePrevWeekStats — quadrantBreakdown", () => {
  it("always returns 5 rows in order Q1 Q2 Q3 Q4 unclassified", () => {
    vi.setSystemTime(MONDAY);
    const result = computePrevWeekStats([makeEntry({ quadrant: "Q1" })]);
    expect(result.quadrantBreakdown.map((b) => b.quadrant)).toEqual([
      "Q1", "Q2", "Q3", "Q4", "unclassified",
    ]);
  });

  it("counts each quadrant correctly", () => {
    vi.setSystemTime(MONDAY);
    const entries = [
      makeEntry({ quadrant: "Q1", completedAt: "2024-01-08T10:00:00" }),
      makeEntry({ quadrant: "Q1", completedAt: "2024-01-09T10:00:00" }),
      makeEntry({ quadrant: "Q2", completedAt: "2024-01-10T10:00:00" }),
      makeEntry({ quadrant: "Q3", completedAt: "2024-01-11T10:00:00" }),
    ];
    const { quadrantBreakdown } = computePrevWeekStats(entries);
    const find = (q: string) => quadrantBreakdown.find((b) => b.quadrant === q)!;
    expect(find("Q1").count).toBe(2);
    expect(find("Q1").percent).toBe(50);
    expect(find("Q2").count).toBe(1);
    expect(find("Q2").percent).toBe(25);
    expect(find("Q3").count).toBe(1);
    expect(find("Q3").percent).toBe(25);
    expect(find("Q4").count).toBe(0);
    expect(find("Q4").percent).toBe(0);
  });

  it("returns all-zero breakdown when no entries", () => {
    vi.setSystemTime(MONDAY);
    const result = computePrevWeekStats([]);
    expect(result.quadrantBreakdown.every((b) => b.count === 0 && b.percent === 0)).toBe(true);
  });

  it("counts unclassified tasks (no quadrant field)", () => {
    vi.setSystemTime(MONDAY);
    const entries = [
      makeEntry({ quadrant: undefined, completedAt: "2024-01-08T10:00:00" }),
      makeEntry({ quadrant: "Q1", completedAt: "2024-01-08T11:00:00" }),
    ];
    const { quadrantBreakdown } = computePrevWeekStats(entries);
    const find = (q: string) => quadrantBreakdown.find((b) => b.quadrant === q)!;
    expect(find("unclassified").count).toBe(1);
    expect(find("unclassified").percent).toBe(50);
  });

  it("excludes entries outside the previous week", () => {
    vi.setSystemTime(MONDAY);
    const entries = [
      makeEntry({ quadrant: "Q1", completedAt: "2024-01-01T10:00:00" }), // two weeks ago
      makeEntry({ quadrant: "Q2", completedAt: "2024-01-15T10:00:00" }), // this week (Monday)
      makeEntry({ quadrant: "Q3", completedAt: "2024-01-08T10:00:00" }), // prev week ✓
    ];
    const result = computePrevWeekStats(entries);
    expect(result.tasksCompleted).toBe(1);
    const find = (q: string) => result.quadrantBreakdown.find((b) => b.quadrant === q)!;
    expect(find("Q3").count).toBe(1);
    expect(find("Q1").count).toBe(0);
    expect(find("Q2").count).toBe(0);
  });

  it("percentages sum to ≤ 101 (rounding tolerance)", () => {
    vi.setSystemTime(MONDAY);
    const entries = [
      makeEntry({ quadrant: "Q1", completedAt: "2024-01-08T10:00:00" }),
      makeEntry({ quadrant: "Q2", completedAt: "2024-01-09T10:00:00" }),
      makeEntry({ quadrant: "Q3", completedAt: "2024-01-10T10:00:00" }),
    ];
    const { quadrantBreakdown } = computePrevWeekStats(entries);
    const sum = quadrantBreakdown.reduce((s, b) => s + b.percent, 0);
    expect(sum).toBeLessThanOrEqual(101);
    expect(sum).toBeGreaterThanOrEqual(99);
  });
});

describe("computeMonthStats", () => {
  // 2024-02-05 → previous calendar month is January 2024.
  const EARLY_FEB = new Date("2024-02-05T10:00:00");

  it("aggregates only the previous calendar month and labels it", () => {
    vi.setSystemTime(EARLY_FEB);
    const entries = [
      makeEntry({ quadrant: "Q1", duration: 30, completedAt: "2024-01-03T10:00:00" }), // Jan ✓
      makeEntry({ quadrant: "Q2", duration: 15, completedAt: "2024-01-31T23:00:00" }), // Jan ✓ (boundary)
      makeEntry({ quadrant: "Q3", duration: 10, completedAt: "2023-12-31T10:00:00" }), // Dec ✗
      makeEntry({ quadrant: "Q4", duration: 10, completedAt: "2024-02-01T10:00:00" }), // Feb ✗
    ];
    const r = computeMonthStats(entries);
    expect(r.tasksCompleted).toBe(2);
    expect(r.focusMinutes).toBe(45);
    expect(r.weekLabel).toBe("January 2024");
    const find = (q: string) => r.quadrantBreakdown.find((b) => b.quadrant === q)!;
    expect(find("Q1").count).toBe(1);
    expect(find("Q2").count).toBe(1);
    expect(find("Q3").count).toBe(0);
  });

  it("rolls the year boundary back (January → previous December)", () => {
    vi.setSystemTime(new Date("2024-01-02T10:00:00"));
    const entries = [
      makeEntry({ completedAt: "2023-12-15T10:00:00" }), // Dec 2023 ✓
      makeEntry({ completedAt: "2024-01-01T10:00:00" }), // Jan 2024 ✗
    ];
    const r = computeMonthStats(entries);
    expect(r.tasksCompleted).toBe(1);
    expect(r.weekLabel).toBe("December 2023");
  });

  it("byDay is a weekday histogram (getDay-indexed)", () => {
    vi.setSystemTime(EARLY_FEB);
    // 2024-01-01 is a Monday (getDay 1); 2024-01-08 also Monday.
    const r = computeMonthStats([
      makeEntry({ completedAt: "2024-01-01T10:00:00" }),
      makeEntry({ completedAt: "2024-01-08T10:00:00" }),
    ]);
    expect(r.byDay[1]).toBe(2);
    expect(r.peakDayIndex).toBe(1);
  });
});

describe("shouldShowMonthlyWrapped / markMonthlyWrappedShown", () => {
  it("shows within the first 3 days of the month, not later", () => {
    vi.setSystemTime(new Date("2024-02-01T09:00:00"));
    expect(shouldShowMonthlyWrapped("u1")).toBe(true);
    vi.setSystemTime(new Date("2024-02-03T09:00:00"));
    expect(shouldShowMonthlyWrapped("u1")).toBe(true);
    vi.setSystemTime(new Date("2024-02-04T09:00:00"));
    expect(shouldShowMonthlyWrapped("u1")).toBe(false);
  });

  it("shows once per month, then is gated; independent per user and per month", () => {
    vi.setSystemTime(new Date("2024-02-02T09:00:00"));
    expect(shouldShowMonthlyWrapped("u1")).toBe(true);
    markMonthlyWrappedShown("u1");
    expect(shouldShowMonthlyWrapped("u1")).toBe(false);
    expect(shouldShowMonthlyWrapped("u2")).toBe(true); // per-user
    // Next month is a fresh key.
    vi.setSystemTime(new Date("2024-03-01T09:00:00"));
    expect(shouldShowMonthlyWrapped("u1")).toBe(true);
  });
});
