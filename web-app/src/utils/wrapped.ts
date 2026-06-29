import type { CompletedEntry } from "@/types/task";
import type { QuadrantCount } from "@/utils/stats";

export interface PrevWeekStats {
  tasksCompleted: number;
  focusMinutes: number;
  q1Tasks: number;
  peakDayIndex: number | null;
  byDay: number[];
  weekLabel: string;
  quadrantBreakdown: QuadrantCount[];
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function wrappedKey(userId: string): string {
  const now = new Date();
  const prevMonday = new Date(now);
  prevMonday.setDate(prevMonday.getDate() - 7);
  return `lumo.wrapped.${userId}.${getISOWeekKey(prevMonday)}`;
}

export function shouldShowWrapped(userId: string): boolean {
  if (new Date().getDay() !== 1) return false;
  return !localStorage.getItem(wrappedKey(userId));
}

export function markWrappedShown(userId: string): void {
  localStorage.setItem(wrappedKey(userId), "1");
}

export function computePrevWeekStats(entries: CompletedEntry[]): PrevWeekStats {
  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const prevWeekStart = new Date(thisWeekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEnd = new Date(thisWeekStart);
  prevWeekEnd.setMilliseconds(-1);

  const weekEntries = entries.filter((e) => {
    if (!e.completedAt) return false;
    const d = new Date(e.completedAt);
    return d >= prevWeekStart && d <= prevWeekEnd;
  });

  const startLabel = prevWeekStart.toLocaleDateString("en", { month: "short", day: "numeric" });
  const endLabel = new Date(prevWeekEnd).toLocaleDateString("en", { month: "short", day: "numeric" });
  return buildPeriodStats(weekEntries, `${startLabel} – ${endLabel}`);
}

/** Recap of the previous calendar month over the full completed history. */
export function computeMonthStats(entries: CompletedEntry[]): PrevWeekStats {
  const now = new Date();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  prevMonthEnd.setMilliseconds(-1);

  const monthEntries = entries.filter((e) => {
    if (!e.completedAt) return false;
    const d = new Date(e.completedAt);
    return d >= prevMonthStart && d <= prevMonthEnd;
  });

  const label = `${MONTH_NAMES[prevMonthStart.getMonth()]} ${prevMonthStart.getFullYear()}`;
  return buildPeriodStats(monthEntries, label);
}

function monthlyWrappedKey(userId: string): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `lumo.wrapped.month.${userId}.${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

/** Offer the monthly recap during the first 3 days of a new month, once per month. */
export function shouldShowMonthlyWrapped(userId: string): boolean {
  if (new Date().getDate() > 3) return false;
  return !localStorage.getItem(monthlyWrappedKey(userId));
}

export function markMonthlyWrappedShown(userId: string): void {
  localStorage.setItem(monthlyWrappedKey(userId), "1");
}

const QUADRANT_ORDER = ["Q1", "Q2", "Q3", "Q4", "unclassified"] as const;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Shared aggregation for a recap period (week or month): a weekday histogram
 * (`byDay` indexed by JS `getDay()`, 0=Sun…6=Sat — "which weekday you ship the
 * most"), quadrant mix, focus minutes, and Q1 count. The weekly and monthly
 * cards render the same shape, differing only in their date range + label.
 */
function buildPeriodStats(periodEntries: CompletedEntry[], label: string): PrevWeekStats {
  const byDay = [0, 0, 0, 0, 0, 0, 0];
  for (const e of periodEntries) {
    if (e.completedAt) byDay[new Date(e.completedAt).getDay()]++;
  }
  const maxDay = Math.max(...byDay);
  const peakDayIndex = maxDay > 0 ? byDay.indexOf(maxDay) : null;

  const counts: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, unclassified: 0 };
  for (const e of periodEntries) {
    const q = e.quadrant ?? "unclassified";
    counts[q] = (counts[q] ?? 0) + 1;
  }
  const total = periodEntries.length;
  const quadrantBreakdown: QuadrantCount[] = QUADRANT_ORDER.map((q) => ({
    quadrant: q,
    count: counts[q],
    percent: total > 0 ? Math.round((counts[q] / total) * 100) : 0,
  }));

  return {
    tasksCompleted: periodEntries.length,
    focusMinutes: periodEntries.reduce((s, e) => s + (e.duration ?? 0), 0),
    q1Tasks: periodEntries.filter((e) => e.quadrant === "Q1").length,
    peakDayIndex,
    byDay,
    weekLabel: label,
    quadrantBreakdown,
  };
}
