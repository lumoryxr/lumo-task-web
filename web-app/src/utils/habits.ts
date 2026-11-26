import type { Habit, HabitLog } from "@/types/task";

/** Maps a habit's `color` field to a CSS token. Single source of truth shared
 *  by HabitCard and the Stats habit-week section. */
export const HABIT_COLOR_MAP: Record<string, string> = {
  green:  "var(--status-success)",
  cyan:   "var(--accent-primary)",
  amber:  "var(--status-warning)",
  red:    "var(--status-urgent)",
  purple: "#a78bfa",
};

/** Resolves a habit's colour token, falling back to green for unknown values. */
export function habitColor(habit: Habit): string {
  return HABIT_COLOR_MAP[habit.color] ?? HABIT_COLOR_MAP.green;
}

/** Returns YYYY-MM-DD for a given Date */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Returns the set of dates on which a habit was completed */
function completedDates(logs: HabitLog[], habitId: string): Set<string> {
  return new Set(logs.filter((l) => l.habitId === habitId).map((l) => l.date));
}

/** Whether a habit is scheduled on a specific date */
export function isScheduledForDate(habit: Habit, date: Date): boolean {
  const day = date.getDay(); // 0=Sun … 6=Sat
  switch (habit.frequency) {
    case "daily":
      return true;
    case "weekdays":
      return day >= 1 && day <= 5;
    case "weekend":
      return day === 0 || day === 6;
    case "days_of_week":
      return (habit.frequencyDays ?? []).includes(day);
    case "times_per_week":
      // Any day is eligible — caller checks weekly quota separately
      return true;
    case "interval": {
      const interval = habit.frequencyInterval ?? 2;
      const origin = new Date(habit.createdAt);
      origin.setHours(0, 0, 0, 0);
      const target = new Date(date);
      target.setHours(0, 0, 0, 0);
      const diffDays = Math.round((target.getTime() - origin.getTime()) / 86400000);
      return diffDays >= 0 && diffDays % interval === 0;
    }
    default:
      return false;
  }
}

/** Whether today is a scheduled day for this habit */
export function isScheduledToday(habit: Habit): boolean {
  return isScheduledForDate(habit, new Date());
}

/** Is this habit completed today? */
export function isCompletedToday(habit: Habit, logs: HabitLog[]): boolean {
  const today = toDateStr(new Date());
  return logs.some((l) => l.habitId === habit.id && l.date === today);
}

/**
 * Count how many times a "times_per_week" habit was completed in the ISO
 * calendar week that contains `referenceDate` (weeks start Monday).
 */
export function weeklyCompletions(
  habit: Habit,
  logs: HabitLog[],
  referenceDate: Date = new Date(),
): number {
  const done = completedDates(logs, habit.id);
  // Find Monday of the reference week
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);
  const dow = ref.getDay(); // 0=Sun
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - ((dow + 6) % 7));

  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    if (done.has(toDateStr(d))) count++;
  }
  return count;
}

/**
 * Whether a times_per_week habit can still be checked in today
 * (weekly quota not yet reached).
 */
export function canCheckInToday(habit: Habit, logs: HabitLog[]): boolean {
  if (habit.frequency !== "times_per_week") return isScheduledToday(habit);
  const quota = habit.frequencyTimes ?? 3;
  return weeklyCompletions(habit, logs) < quota;
}

/**
 * Compute the current streak (consecutive scheduled units with a completion).
 * For times_per_week the "unit" is a calendar week; for all others it is a day.
 */
export function currentStreak(habit: Habit, logs: HabitLog[]): number {
  if (habit.frequency === "times_per_week") {
    return _weeklyStreak(habit, logs, false);
  }
  const done = completedDates(logs, habit.id);
  let streak = 0;
  const today = new Date();

  for (let i = 0; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (!isScheduledForDate(habit, d)) continue;

    const dateStr = toDateStr(d);
    if (done.has(dateStr)) {
      streak++;
    } else {
      if (i === 0) continue; // allow today not yet done
      break;
    }
  }
  return streak;
}

/**
 * Longest streak ever for a habit.
 */
export function longestStreak(habit: Habit, logs: HabitLog[]): number {
  if (habit.frequency === "times_per_week") {
    return _weeklyStreak(habit, logs, true);
  }
  const done = completedDates(logs, habit.id);
  if (done.size === 0) return 0;

  const today = new Date();
  let best = 0;
  let current = 0;

  for (let i = 365; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (!isScheduledForDate(habit, d)) continue;

    const dateStr = toDateStr(d);
    if (done.has(dateStr)) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

/** Streak helper for times_per_week (counts consecutive weeks meeting quota) */
function _weeklyStreak(habit: Habit, logs: HabitLog[], longest: boolean): number {
  const quota = habit.frequencyTimes ?? 3;
  const today = new Date();
  // Find Monday of current week
  const dow = today.getDay();
  const thisMonday = new Date(today);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(today.getDate() - ((dow + 6) % 7));

  let streak = 0;
  let best = 0;

  for (let w = 0; w <= 52; w++) {
    const monday = new Date(thisMonday);
    monday.setDate(thisMonday.getDate() - w * 7);
    const count = weeklyCompletions(habit, logs, monday);

    if (count >= quota) {
      streak++;
      best = Math.max(best, streak);
    } else {
      if (w === 0) continue; // allow current week still in progress
      if (longest) {
        streak = 0;
      } else {
        break;
      }
    }
  }
  return longest ? best : streak;
}

/**
 * Get the completion rate over the past N days (only scheduled days counted).
 * Returns a value 0–1.
 */
export function completionRate(habit: Habit, logs: HabitLog[], days = 30): number {
  const done = completedDates(logs, habit.id);
  const today = new Date();
  let scheduled = 0;
  let completed = 0;

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (!isScheduledForDate(habit, d)) continue;
    scheduled++;
    if (done.has(toDateStr(d))) completed++;
  }

  return scheduled === 0 ? 0 : completed / scheduled;
}

/** Total number of times a habit has been logged */
export function totalCompletions(habit: Habit, logs: HabitLog[]): number {
  return logs.filter((l) => l.habitId === habit.id).length;
}

/** One day in a habit's recent history, for the card's week strip. */
export interface HabitDay {
  date: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  scheduled: boolean;
  done: boolean;
  isToday: boolean;
}

/** The last `n` days (today included), oldest first. */
export function lastNDays(habit: Habit, logs: HabitLog[], n = 7): HabitDay[] {
  const done = completedDates(logs, habit.id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: HabitDay[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const date = toDateStr(d);
    out.push({ date, weekday: d.getDay(), scheduled: isScheduledForDate(habit, d), done: done.has(date), isToday: i === 0 });
  }
  return out;
}

export interface HabitsOverview {
  scheduledToday: number;
  doneToday: number;
  bestStreak: { habitId: string; title: string; days: number } | null;
  /** Check-ins logged since this Monday. */
  weekCheckIns: number;
  /** Average 30-day completion across habits, 0–100. */
  rate30: number;
}

/** The Habits page summary: today's progress, the best running streak, this week and the last 30 days. */
export function habitsOverview(habits: Habit[], logs: HabitLog[]): HabitsOverview {
  const today = toDateStr(new Date());
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const mondayStr = toDateStr(monday);
  const ids = new Set(habits.map((h) => h.id));

  let scheduledToday = 0;
  let doneToday = 0;
  let best: HabitsOverview["bestStreak"] = null;
  let rateSum = 0;
  for (const h of habits) {
    const doneNow = logs.some((l) => l.habitId === h.id && l.date === today);
    if (isScheduledToday(h) || doneNow) {
      scheduledToday++;
      if (doneNow) doneToday++;
    }
    const s = currentStreak(h, logs);
    if (s > 0 && (!best || s > best.days)) best = { habitId: h.id, title: h.title, days: s };
    rateSum += completionRate(h, logs, 30);
  }
  return {
    scheduledToday,
    doneToday,
    bestStreak: best,
    weekCheckIns: logs.filter((l) => ids.has(l.habitId) && l.date >= mondayStr && l.date <= today).length,
    rate30: habits.length ? Math.round((rateSum / habits.length) * 100) : 0,
  };
}
