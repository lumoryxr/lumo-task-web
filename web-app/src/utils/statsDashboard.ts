import type { CompletedEntry } from "@/types/task";
import { computeTagDistribution, percentDistribution, type QuadrantCount, type TagCount } from "@/utils/stats";
import { toDateStr } from "@/utils/habits";

/** One day of the range: its local date, tasks finished and focus minutes. */
export interface DailyPoint {
  date: string;
  count: number;
  minutes: number;
}

export interface Dashboard {
  rangeDays: number;
  tasks: number;
  focusMinutes: number;
  /** The same totals over the equally long period just before the range. */
  prevTasks: number;
  prevFocusMinutes: number;
  /** One point per day, oldest first, ending today. */
  daily: DailyPoint[];
  activeDays: number;
  /** Tasks per day that had any, to one decimal. */
  avgPerActiveDay: number;
  bestDay: { date: string; count: number } | null;
  quadrants: QuadrantCount[];
  /** heat[weekday][hour], Monday-first weekdays, local hours 0–23. */
  heat: number[][];
  heatMax: number;
  peakHour: number | null;
  /** Monday-first weekday index (0 = Mon … 6 = Sun). */
  peakWeekday: number | null;
  projects: Array<{ id: string; count: number }>;
  tags: TagCount[];
}

const QUADRANTS = ["Q1", "Q2", "Q3", "Q4", "unclassified"] as const;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Change against the previous period in whole percent; null when there was nothing to compare with. */
export function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Everything the Stats dashboard shows for the last `rangeDays` days (today
 * included), bucketed by the viewer's local day and hour. Pure: `now` is a
 * parameter so the numbers are reproducible in tests.
 */
export function computeDashboard(entries: CompletedEntry[], rangeDays: number, now: Date = new Date()): Dashboard {
  const start = addDays(startOfDay(now), -(rangeDays - 1));
  const end = addDays(startOfDay(now), 1); // exclusive
  const prevStart = addDays(start, -rangeDays);

  const inRange: CompletedEntry[] = [];
  let prevTasks = 0;
  let prevFocusMinutes = 0;
  for (const e of entries) {
    if (!e.completedAt) continue;
    const t = new Date(e.completedAt);
    if (t >= start && t < end) inRange.push(e);
    else if (t >= prevStart && t < start) {
      prevTasks++;
      prevFocusMinutes += e.duration ?? 0;
    }
  }

  const daily: DailyPoint[] = Array.from({ length: rangeDays }, (_, i) => ({
    date: toDateStr(addDays(start, i)),
    count: 0,
    minutes: 0,
  }));
  const dayIndex = new Map(daily.map((p, i) => [p.date, i]));
  const heat = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const hourTotals = new Array<number>(24).fill(0);
  const weekdayTotals = new Array<number>(7).fill(0);
  const quadrantCounts: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, unclassified: 0 };
  const projectCounts = new Map<string, number>();

  for (const e of inRange) {
    if (!e.completedAt) continue;
    const t = new Date(e.completedAt);
    const i = dayIndex.get(toDateStr(t));
    if (i !== undefined) {
      daily[i].count++;
      daily[i].minutes += e.duration ?? 0;
    }
    const wd = (t.getDay() + 6) % 7; // Monday-first
    heat[wd][t.getHours()]++;
    hourTotals[t.getHours()]++;
    weekdayTotals[wd]++;
    const q = e.quadrant ?? "unclassified";
    quadrantCounts[q] = (quadrantCounts[q] ?? 0) + 1;
    if (e.projectId) projectCounts.set(e.projectId, (projectCounts.get(e.projectId) ?? 0) + 1);
  }

  const activeDays = daily.filter((p) => p.count > 0).length;
  const bestPoint = daily.reduce<DailyPoint | null>((best, p) => (p.count > 0 && (!best || p.count >= best.count) ? p : best), null);
  const percents = percentDistribution(QUADRANTS.map((q) => quadrantCounts[q]));
  const argmax = (xs: number[]) => {
    const max = Math.max(...xs);
    return max > 0 ? xs.indexOf(max) : null;
  };

  return {
    rangeDays,
    tasks: inRange.length,
    focusMinutes: inRange.reduce((s, e) => s + (e.duration ?? 0), 0),
    prevTasks,
    prevFocusMinutes,
    daily,
    activeDays,
    avgPerActiveDay: activeDays > 0 ? Math.round((inRange.length / activeDays) * 10) / 10 : 0,
    bestDay: bestPoint ? { date: bestPoint.date, count: bestPoint.count } : null,
    quadrants: QUADRANTS.map((q, i) => ({ quadrant: q, count: quadrantCounts[q], percent: percents[i] })),
    heat,
    heatMax: Math.max(0, ...heat.flat()),
    peakHour: argmax(hourTotals),
    peakWeekday: argmax(weekdayTotals),
    projects: [...projectCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, count]) => ({ id, count })),
    tags: computeTagDistribution(inRange),
  };
}
