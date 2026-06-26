import type { CountdownCalendar, CountdownEvent } from "@/types/task";
import { formatLunarISO, nextLunarYearlyISO } from "@/utils/lunar";

const MS_PER_DAY = 86_400_000;

function clampDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Days until a countdown's next occurrence.
 *
 * `dateStr` is always the solar (Gregorian) anchor. For lunar events the anchor
 * is the solar date of the (first) occurrence; yearly lunar recurrence is
 * computed on the anchor's lunar month/day (see {@link nextLunarYearlyISO}).
 * If lunar conversion is unavailable (anchor out of the 1900–2100 range) we
 * fall back to plain solar handling so a value is always returned.
 */
export function daysUntil(
  dateStr: string,
  repeat: CountdownEvent["repeat"],
  calendar: CountdownCalendar = "solar",
): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (calendar === "lunar" && repeat === "yearly") {
    const nextISO = nextLunarYearlyISO(dateStr, today);
    if (nextISO) return daysBetween(today, new Date(nextISO + "T00:00:00"));
    // else fall through to solar handling
  }

  const target = new Date(dateStr + "T00:00:00");

  if (repeat === "yearly") {
    const thisYear = clampDate(today.getFullYear(), target.getMonth(), target.getDate());
    if (thisYear < today) {
      const nextYear = clampDate(today.getFullYear() + 1, target.getMonth(), target.getDate());
      return daysBetween(today, nextYear);
    }
    return daysBetween(today, thisYear);
  }

  return daysBetween(today, target);
}

/**
 * Human-readable date label. Solar events use the locale's short date; lunar
 * events render the Chinese lunar date (e.g. "五月十二", or with the year for
 * non-repeating events), with a fallback to the solar label if conversion is
 * unavailable.
 */
export function fmtDate(
  dateStr: string,
  repeat: CountdownEvent["repeat"],
  locale: string,
  calendar: CountdownCalendar = "solar",
): string {
  if (calendar === "lunar") {
    const lunar = formatLunarISO(dateStr, { withYear: repeat === "none" });
    if (lunar) return lunar;
    // else fall through to solar formatting
  }

  const d = new Date(dateStr + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (repeat === "none") opts.year = "numeric";
  return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", opts);
}
