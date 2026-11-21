import { describe, it, expect } from "vitest";
import { computeDashboard, deltaPct } from "../statsDashboard";
import type { CompletedEntry } from "@/types/task";

// Local-time fixture helpers: the dashboard buckets by the viewer's local day.
const NOW = new Date(2026, 10, 21, 15, 0, 0); // Sat 21 Nov 2026, 15:00 local
function at(daysAgo: number, hour: number, extra: Partial<CompletedEntry> = {}): CompletedEntry {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 10, 0, 0);
  return {
    id: `e${daysAgo}-${hour}-${Math.random().toString(36).slice(2, 6)}`,
    title: { en: "x" },
    duration: 25,
    completedAt: d.toISOString(),
    quadrant: "Q2",
    ...extra,
  };
}

describe("computeDashboard", () => {
  it("counts tasks and focus in the range and in the period before it", () => {
    const entries = [
      at(0, 9), at(1, 10), at(6, 11), // in the last 7 days
      at(7, 9), at(13, 9),            // the 7 days before
      at(20, 9),                       // outside both
    ];
    const d = computeDashboard(entries, 7, NOW);
    expect(d.tasks).toBe(3);
    expect(d.focusMinutes).toBe(75);
    expect(d.prevTasks).toBe(2);
    expect(d.prevFocusMinutes).toBe(50);
  });

  it("returns one point per day, oldest first, ending today", () => {
    const d = computeDashboard([at(0, 9), at(0, 14, { duration: 50 }), at(2, 9)], 7, NOW);
    expect(d.daily).toHaveLength(7);
    expect(d.daily[6]).toEqual({ date: "2026-11-21", count: 2, minutes: 75 });
    expect(d.daily[4]).toMatchObject({ date: "2026-11-19", count: 1 });
    expect(d.daily[0].date).toBe("2026-11-15");
  });

  it("reports active days, the average per active day and the best day", () => {
    const d = computeDashboard([at(0, 9), at(0, 10), at(0, 11), at(3, 9)], 7, NOW);
    expect(d.activeDays).toBe(2);
    expect(d.avgPerActiveDay).toBe(2);
    expect(d.bestDay).toEqual({ date: "2026-11-21", count: 3 });
  });

  it("splits the range by quadrant with shares that add up to 100", () => {
    const d = computeDashboard(
      [at(0, 9, { quadrant: "Q1" }), at(0, 9, { quadrant: "Q2" }), at(1, 9, { quadrant: "Q2" }), at(1, 9, { quadrant: undefined })],
      7,
      NOW,
    );
    const byQ = Object.fromEntries(d.quadrants.map((q) => [q.quadrant, q]));
    expect(byQ.Q1.count).toBe(1);
    expect(byQ.Q2.count).toBe(2);
    expect(byQ.unclassified.count).toBe(1);
    expect(d.quadrants.reduce((s, q) => s + q.percent, 0)).toBe(100);
  });

  it("maps completions onto a Monday-first weekday × hour grid and finds the peak", () => {
    // NOW is a Saturday → index 5 in a Monday-first week.
    const d = computeDashboard([at(0, 10), at(0, 10), at(1, 22)], 7, NOW);
    expect(d.heat).toHaveLength(7);
    expect(d.heat[5][10]).toBe(2);
    expect(d.heat[4][22]).toBe(1); // Friday 22:00
    expect(d.heatMax).toBe(2);
    expect(d.peakHour).toBe(10);
    expect(d.peakWeekday).toBe(5);
  });

  it("ranks projects and tags by how much finished work they hold", () => {
    const d = computeDashboard(
      [
        at(0, 9, { projectId: "p1", tags: ["deep"] }),
        at(1, 9, { projectId: "p1", tags: ["deep", "mail"] }),
        at(2, 9, { projectId: "p2" }),
        at(3, 9, { projectId: null }),
      ],
      7,
      NOW,
    );
    expect(d.projects).toEqual([{ id: "p1", count: 2 }, { id: "p2", count: 1 }]);
    expect(d.tags.map((x) => [x.tag, x.count])).toEqual([["deep", 2], ["mail", 1]]);
  });

  it("is empty-safe", () => {
    const d = computeDashboard([], 30, NOW);
    expect(d.tasks).toBe(0);
    expect(d.daily).toHaveLength(30);
    expect(d.bestDay).toBeNull();
    expect(d.peakHour).toBeNull();
    expect(d.avgPerActiveDay).toBe(0);
  });
});

describe("deltaPct", () => {
  it("is the rounded change against the previous period", () => {
    expect(deltaPct(12, 10)).toBe(20);
    expect(deltaPct(5, 10)).toBe(-50);
    expect(deltaPct(10, 10)).toBe(0);
  });

  it("has no percentage when there was nothing before", () => {
    expect(deltaPct(3, 0)).toBeNull();
    expect(deltaPct(0, 0)).toBeNull();
  });
});
