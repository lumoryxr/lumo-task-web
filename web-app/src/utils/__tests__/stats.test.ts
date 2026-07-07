import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { computeWeekStats, computeTagDistribution, percentDistribution } from "../stats";
import type { CompletedEntry } from "@/types/task";

// Pin time to a known Wednesday (2026-06-17)
const FIXED_NOW = new Date("2026-06-17T12:00:00Z");

function makeEntry(overrides: Partial<CompletedEntry> = {}): CompletedEntry {
  return {
    id: Math.random().toString(),
    title: { en: "Task", zh: "任务" },
    duration: 25,
    completedAt: FIXED_NOW.toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("computeWeekStats — quadrantBreakdown", () => {
  it("always returns 5 rows in order Q1 Q2 Q3 Q4 unclassified", () => {
    const result = computeWeekStats([makeEntry({ quadrant: "Q1" })]);
    expect(result.quadrantBreakdown.map((b) => b.quadrant)).toEqual([
      "Q1",
      "Q2",
      "Q3",
      "Q4",
      "unclassified",
    ]);
  });

  it("counts each quadrant correctly", () => {
    const entries = [
      makeEntry({ quadrant: "Q1" }),
      makeEntry({ quadrant: "Q1" }),
      makeEntry({ quadrant: "Q2" }),
      makeEntry({ quadrant: "Q3" }),
      makeEntry({ quadrant: undefined }),
    ];
    const { quadrantBreakdown } = computeWeekStats(entries);
    const find = (q: string) => quadrantBreakdown.find((b) => b.quadrant === q)!;
    expect(find("Q1").count).toBe(2);
    expect(find("Q2").count).toBe(1);
    expect(find("Q3").count).toBe(1);
    expect(find("Q4").count).toBe(0);
    expect(find("unclassified").count).toBe(1);
  });

  it("percentages sum to exactly 100 (largest-remainder rounding)", () => {
    const entries = Array.from({ length: 3 }, (_, i) =>
      makeEntry({ quadrant: (["Q1", "Q2", "Q3"] as const)[i] })
    );
    const { quadrantBreakdown } = computeWeekStats(entries);
    const sum = quadrantBreakdown.reduce((s, b) => s + b.percent, 0);
    expect(sum).toBe(100);
  });

  it("returns 0% for all quadrants when no entries", () => {
    const { quadrantBreakdown } = computeWeekStats([]);
    for (const b of quadrantBreakdown) {
      expect(b.count).toBe(0);
      expect(b.percent).toBe(0);
    }
  });

  it("only counts entries completed this week", () => {
    const lastWeek = new Date(FIXED_NOW);
    lastWeek.setDate(lastWeek.getDate() - 8);
    const entries = [
      makeEntry({ quadrant: "Q1", completedAt: FIXED_NOW.toISOString() }),
      makeEntry({ quadrant: "Q2", completedAt: lastWeek.toISOString() }),
    ];
    const { quadrantBreakdown } = computeWeekStats(entries);
    expect(quadrantBreakdown.find((b) => b.quadrant === "Q1")!.count).toBe(1);
    expect(quadrantBreakdown.find((b) => b.quadrant === "Q2")!.count).toBe(0);
  });

  it("q1Tasks matches the Q1 count in quadrantBreakdown", () => {
    const entries = [
      makeEntry({ quadrant: "Q1" }),
      makeEntry({ quadrant: "Q1" }),
      makeEntry({ quadrant: "Q2" }),
    ];
    const result = computeWeekStats(entries);
    expect(result.q1Tasks).toBe(result.quadrantBreakdown.find((b) => b.quadrant === "Q1")!.count);
  });
});

describe("computeTagDistribution", () => {
  it("returns [] when no entry carries a tag", () => {
    expect(computeTagDistribution([makeEntry(), makeEntry({ tags: [] })])).toEqual([]);
  });

  it("counts occurrences across entries; one multi-tag entry hits every tag", () => {
    const dist = computeTagDistribution([
      makeEntry({ tags: ["work", "urgent"] }),
      makeEntry({ tags: ["work"] }),
      makeEntry({ tags: ["home"] }),
    ]);
    const byTag = Object.fromEntries(dist.map((d) => [d.tag, d.count]));
    expect(byTag).toEqual({ work: 2, urgent: 1, home: 1 });
  });

  it("sorts by count desc then tag asc, and scales percent to the top tag", () => {
    const dist = computeTagDistribution([
      makeEntry({ tags: ["b"] }),
      makeEntry({ tags: ["a"] }),
      makeEntry({ tags: ["a"] }),
    ]);
    expect(dist.map((d) => d.tag)).toEqual(["a", "b"]);
    expect(dist[0]).toMatchObject({ tag: "a", count: 2, percent: 100 });
    expect(dist[1]).toMatchObject({ tag: "b", count: 1, percent: 50 });
  });

  it("trims whitespace and ignores blank tags", () => {
    const dist = computeTagDistribution([
      makeEntry({ tags: ["  work  ", "", "   "] }),
      makeEntry({ tags: ["work"] }),
    ]);
    expect(dist).toEqual([{ tag: "work", count: 2, percent: 100 }]);
  });
});

describe("percentDistribution", () => {
  it("sums to exactly 100 where plain rounding would give 99", () => {
    // Three equal thirds: Math.round(33.33)*3 = 99. Largest-remainder → 100.
    const out = percentDistribution([1, 1, 1]);
    expect(out.reduce((s, x) => s + x, 0)).toBe(100);
    // One item absorbs the leftover point.
    expect(out.filter((x) => x === 34)).toHaveLength(1);
    expect(out.filter((x) => x === 33)).toHaveLength(2);
  });

  it("keeps exact splits exact", () => {
    expect(percentDistribution([2, 1, 1, 0])).toEqual([50, 25, 25, 0]);
  });

  it("leaves zero counts at 0 and still sums to 100", () => {
    const out = percentDistribution([5, 0, 0, 2]);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
    expect(out.reduce((s, x) => s + x, 0)).toBe(100);
  });

  it("returns all zeros for an all-zero total", () => {
    expect(percentDistribution([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
