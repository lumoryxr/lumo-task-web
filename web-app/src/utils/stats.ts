import type { CompletedEntry } from "@/types/task";

export interface QuadrantCount {
  quadrant: "Q1" | "Q2" | "Q3" | "Q4" | "unclassified";
  count: number;
  percent: number;
}

/**
 * Percent share of each count in an ordered list, rounded so the results sum to
 * exactly 100 when the total is positive (plain per-item `Math.round` can drift
 * to 99 or 101, which shows up as distribution labels that don't add up). Uses
 * the largest-remainder (Hamilton) method: floor everything, then hand the
 * leftover points to the largest fractional parts. Zero counts stay 0; an
 * all-zero total returns all zeros.
 */
export function percentDistribution(counts: number[]): number[] {
  const total = counts.reduce((s, c) => s + c, 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const result = exact.map((x) => Math.floor(x));
  let leftover = 100 - result.reduce((s, x) => s + x, 0);
  const byFrac = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < byFrac.length && leftover > 0; k++) {
    result[byFrac[k].i] += 1;
    leftover -= 1;
  }
  return result;
}

export interface WeekStats {
  tasksCompleted: number;
  focusMinutes: number;
  q1Tasks: number;
  peakHour: number | null;
  byDay: number[]; // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  weekStart: Date;
  weekEnd: Date;
  quadrantBreakdown: QuadrantCount[];
}

export interface AllTimeStats {
  tasksCompleted: number;
  focusMinutes: number;
  currentStreak: number;
  bestStreak: number;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeWeekStats(entries: CompletedEntry[]): WeekStats {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const weekEntries = entries.filter((e) => {
    if (!e.completedAt) return false;
    const d = new Date(e.completedAt);
    return d >= weekStart && d <= new Date(weekEnd.getTime() + 86400000);
  });

  const byDay = [0, 0, 0, 0, 0, 0, 0];
  const hourCounts: number[] = new Array(24).fill(0);

  for (const e of weekEntries) {
    if (!e.completedAt) continue;
    const d = new Date(e.completedAt);
    byDay[d.getDay()]++;
    hourCounts[d.getHours()]++;
  }

  const maxHourCount = Math.max(...hourCounts);
  const peakHour = maxHourCount > 0 ? hourCounts.indexOf(maxHourCount) : null;

  const quadrantOrder = ["Q1", "Q2", "Q3", "Q4", "unclassified"] as const;
  const counts: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, unclassified: 0 };
  for (const e of weekEntries) {
    const q = e.quadrant ?? "unclassified";
    counts[q] = (counts[q] ?? 0) + 1;
  }
  const percents = percentDistribution(quadrantOrder.map((q) => counts[q]));
  const quadrantBreakdown: QuadrantCount[] = quadrantOrder.map((q, i) => ({
    quadrant: q,
    count: counts[q],
    percent: percents[i],
  }));

  return {
    tasksCompleted: weekEntries.length,
    focusMinutes: weekEntries.reduce((s, e) => s + (e.duration ?? 0), 0),
    q1Tasks: counts["Q1"],
    peakHour,
    byDay,
    weekStart,
    weekEnd,
    quadrantBreakdown,
  };
}

export function computeAllTimeStats(entries: CompletedEntry[]): AllTimeStats {
  if (entries.length === 0) {
    return { tasksCompleted: 0, focusMinutes: 0, currentStreak: 0, bestStreak: 0 };
  }

  const doneByDay = new Set(
    entries
      .filter((e) => e.completedAt)
      .map((e) => toDateStr(new Date(e.completedAt!)))
  );

  // Compute current streak (consecutive days ending today/yesterday)
  let currentStreak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (doneByDay.has(toDateStr(d))) {
      currentStreak++;
    } else if (i === 0) {
      // today not done yet, check yesterday
      continue;
    } else {
      break;
    }
  }

  // Compute best streak
  const sortedDays = [...doneByDay].sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const day of sortedDays) {
    const d = new Date(day);
    if (prev) {
      const diff = (d.getTime() - prev.getTime()) / 86400000;
      if (diff === 1) {
        run++;
      } else {
        run = 1;
      }
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prev = d;
  }

  return {
    tasksCompleted: entries.length,
    focusMinutes: entries.reduce((s, e) => s + (e.duration ?? 0), 0),
    currentStreak,
    bestStreak: best,
  };
}

export interface TagCount {
  tag: string;
  count: number;
  percent: number; // share of the busiest tag's count (for bar width), 0-100
}

/**
 * Tag distribution over completed work (Tags V2). Counts how many finished
 * entries carry each tag, sorted by count desc then tag asc for stability. One
 * entry with N tags contributes to N tags. `percent` is relative to the top
 * tag's count so the leader's bar is always full-width. Returns [] when nothing
 * completed carries a tag.
 */
export function computeTagDistribution(entries: CompletedEntry[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    for (const raw of e.tags ?? []) {
      const tag = raw.trim();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  const max = sorted.length ? sorted[0][1] : 0;
  return sorted.map(([tag, count]) => ({
    tag,
    count,
    percent: max > 0 ? Math.round((count / max) * 100) : 0,
  }));
}

export function fmtHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}
