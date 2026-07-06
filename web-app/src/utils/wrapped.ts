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

/** A past recap the user can re-open from the Recaps gallery (#171 V2b). */
export interface RecapRef {
  id: string;
  kind: "week" | "month" | "year";
  stats: PrevWeekStats;
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

interface PeriodRange { start: Date; end: Date; label: string; id: string }

/** Range + label + stable id for the week `weeksAgo` weeks before the current one (1 = last week). */
function weekRangeAgo(now: Date, weeksAgo: number): PeriodRange {
  const thisWeekStart = startOfWeek(now);
  const start = new Date(thisWeekStart);
  start.setDate(start.getDate() - 7 * weeksAgo);
  const end = new Date(thisWeekStart);
  end.setDate(end.getDate() - 7 * (weeksAgo - 1));
  end.setMilliseconds(-1);
  const startLabel = start.toLocaleDateString("en", { month: "short", day: "numeric" });
  const endLabel = new Date(end).toLocaleDateString("en", { month: "short", day: "numeric" });
  return { start, end, label: `${startLabel} – ${endLabel}`, id: `week:${getISOWeekKey(start)}` };
}

/** Range + label + stable id for the calendar month `monthsAgo` months back (1 = last month). */
function monthRangeAgo(now: Date, monthsAgo: number): PeriodRange {
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 1, 0, 0, 0, 0);
  end.setMilliseconds(-1);
  const label = `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
  const id = `month:${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  return { start, end, label, id };
}

/** Range + label + stable id for the calendar year `yearsAgo` years back (1 = last year). */
function yearRangeAgo(now: Date, yearsAgo: number): PeriodRange {
  const year = now.getFullYear() - yearsAgo;
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year + 1, 0, 1, 0, 0, 0, 0);
  end.setMilliseconds(-1);
  return { start, end, label: `${year}`, id: `year:${year}` };
}

function statsForRange(entries: CompletedEntry[], r: PeriodRange): PrevWeekStats {
  const inRange = entries.filter((e) => {
    if (!e.completedAt) return false;
    const d = new Date(e.completedAt);
    return d >= r.start && d <= r.end;
  });
  return buildPeriodStats(inRange, r.label);
}

export function computePrevWeekStats(entries: CompletedEntry[]): PrevWeekStats {
  return statsForRange(entries, weekRangeAgo(new Date(), 1));
}

/** Recap of the previous calendar month over the full completed history. */
export function computeMonthStats(entries: CompletedEntry[]): PrevWeekStats {
  return statsForRange(entries, monthRangeAgo(new Date(), 1));
}

/** Recap of the previous calendar year over the full completed history. */
export function computeYearStats(entries: CompletedEntry[]): PrevWeekStats {
  return statsForRange(entries, yearRangeAgo(new Date(), 1));
}

/**
 * Past recaps (most recent first within each kind) that had ≥1 completed task,
 * for the re-accessible Recaps gallery (#171 V2b): up to `weeks` past weeks,
 * then up to `months` past months, then up to `years` past calendar years.
 */
export function listRecaps(
  entries: CompletedEntry[],
  opts: { weeks?: number; months?: number; years?: number } = {},
): RecapRef[] {
  const weeks = opts.weeks ?? 8;
  const months = opts.months ?? 6;
  const years = opts.years ?? 2;
  const now = new Date();
  const out: RecapRef[] = [];
  for (let w = 1; w <= weeks; w++) {
    const r = weekRangeAgo(now, w);
    const stats = statsForRange(entries, r);
    if (stats.tasksCompleted > 0) out.push({ id: r.id, kind: "week", stats });
  }
  for (let m = 1; m <= months; m++) {
    const r = monthRangeAgo(now, m);
    const stats = statsForRange(entries, r);
    if (stats.tasksCompleted > 0) out.push({ id: r.id, kind: "month", stats });
  }
  for (let y = 1; y <= years; y++) {
    const r = yearRangeAgo(now, y);
    const stats = statsForRange(entries, r);
    if (stats.tasksCompleted > 0) out.push({ id: r.id, kind: "year", stats });
  }
  return out;
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

function yearlyWrappedKey(userId: string): string {
  const prevYear = new Date().getFullYear() - 1;
  return `lumo.wrapped.year.${userId}.${prevYear}`;
}

/** Offer the yearly recap during the first 7 days of a new year, once per year. */
export function shouldShowYearlyWrapped(userId: string): boolean {
  const now = new Date();
  if (now.getMonth() !== 0 || now.getDate() > 7) return false;
  return !localStorage.getItem(yearlyWrappedKey(userId));
}

export function markYearlyWrappedShown(userId: string): void {
  localStorage.setItem(yearlyWrappedKey(userId), "1");
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
