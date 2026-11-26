import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { currentStreak, isCompletedToday, completionRate, longestStreak, toDateStr } from "../habits";
import type { Habit, HabitLog } from "@/types/task";

const DAILY_HABIT: Habit = {
  id: "h1",
  title: "Morning run",
  color: "green",
  frequency: "daily",
  createdAt: "2024-01-01T00:00:00.000Z",
};

const WEEKDAY_HABIT: Habit = {
  id: "h2",
  title: "Read",
  color: "amber",
  frequency: "weekdays",
  createdAt: "2024-01-01T00:00:00.000Z",
};

function log(habitId: string, date: string): HabitLog {
  return { habitId, date, completedAt: `${date}T08:00:00.000Z` };
}

// Fix "today" to a known Tuesday (2026-05-19)
const FIXED_NOW = new Date("2026-05-19T10:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toDateStr", () => {
  it("formats date correctly", () => {
    expect(toDateStr(new Date("2026-05-19T00:00:00"))).toBe("2026-05-19");
  });
});

describe("currentStreak", () => {
  it("returns 0 when no logs", () => {
    expect(currentStreak(DAILY_HABIT, [])).toBe(0);
  });

  it("returns 1 when only today is logged", () => {
    const logs = [log("h1", "2026-05-19")];
    expect(currentStreak(DAILY_HABIT, logs)).toBe(1);
  });

  it("counts consecutive days including today", () => {
    const logs = [
      log("h1", "2026-05-17"),
      log("h1", "2026-05-18"),
      log("h1", "2026-05-19"),
    ];
    expect(currentStreak(DAILY_HABIT, logs)).toBe(3);
  });

  it("breaks streak on gap (daily habit)", () => {
    const logs = [
      log("h1", "2026-05-16"),
      // gap on 17th
      log("h1", "2026-05-18"),
      log("h1", "2026-05-19"),
    ];
    expect(currentStreak(DAILY_HABIT, logs)).toBe(2);
  });

  it("counts weekday streak correctly, skipping weekend", () => {
    // Fixed date is Tuesday May 19. Weekend was Sat/Sun May 16/17.
    // Mon May 18 + Tue May 19 = streak of 2 (weekend is not scheduled)
    const logs = [
      log("h2", "2026-05-18"),
      log("h2", "2026-05-19"),
    ];
    expect(currentStreak(WEEKDAY_HABIT, logs)).toBe(2);
  });

  it("does not break streak when today is not yet completed (streak from yesterday)", () => {
    const logs = [
      log("h1", "2026-05-18"),
      // today not done yet
    ];
    // Streak counts yesterday but today (skipped) does not break it
    expect(currentStreak(DAILY_HABIT, logs)).toBe(1);
  });
});

describe("isCompletedToday", () => {
  it("returns false when no logs", () => {
    expect(isCompletedToday(DAILY_HABIT, [])).toBe(false);
  });

  it("returns true when today logged", () => {
    const logs = [log("h1", "2026-05-19")];
    expect(isCompletedToday(DAILY_HABIT, logs)).toBe(true);
  });

  it("returns false when only yesterday logged", () => {
    const logs = [log("h1", "2026-05-18")];
    expect(isCompletedToday(DAILY_HABIT, logs)).toBe(false);
  });
});

describe("completionRate", () => {
  it("returns 0 for no logs", () => {
    expect(completionRate(DAILY_HABIT, [], 7)).toBe(0);
  });

  it("returns 1.0 when all 7 days completed (daily)", () => {
    const logs = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(FIXED_NOW);
      d.setDate(d.getDate() - i);
      return log("h1", toDateStr(d));
    });
    expect(completionRate(DAILY_HABIT, logs, 7)).toBe(1);
  });

  it("handles partial completion", () => {
    const logs = [log("h1", "2026-05-19"), log("h1", "2026-05-18")];
    const rate = completionRate(DAILY_HABIT, logs, 7);
    expect(rate).toBeCloseTo(2 / 7);
  });
});

describe("longestStreak", () => {
  it("returns 0 for no logs", () => {
    expect(longestStreak(DAILY_HABIT, [])).toBe(0);
  });

  it("returns correct longest streak", () => {
    // 3 consecutive days, gap, 1 day
    const logs = [
      log("h1", "2026-05-12"),
      log("h1", "2026-05-13"),
      log("h1", "2026-05-14"),
      // gap 15
      log("h1", "2026-05-16"),
    ];
    expect(longestStreak(DAILY_HABIT, logs)).toBe(3);
  });
});

// ── Habits page overview (week strip + today summary) ────────────────────────
import { lastNDays, habitsOverview } from "../habits";

describe("lastNDays", () => {
  const H = { id: "w", title: "Workout", color: "green", frequency: "weekdays", createdAt: "2024-01-01T00:00:00.000Z" } as const;

  it("returns the last 7 days oldest first, marking done, scheduled and today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 26, 10)); // Thu 26 Nov 2026
    try {
      const days = lastNDays(H, [{ habitId: "w", date: "2026-11-25", completedAt: "" }], 7);
      expect(days).toHaveLength(7);
      expect(days[0].date).toBe("2026-11-20"); // Friday
      expect(days[6]).toMatchObject({ date: "2026-11-26", isToday: true, scheduled: true, done: false });
      expect(days[5]).toMatchObject({ date: "2026-11-25", done: true });
      // Sat 21 / Sun 22 are not weekdays.
      expect(days[1]).toMatchObject({ weekday: 6, scheduled: false });
      expect(days[2]).toMatchObject({ weekday: 0, scheduled: false });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("habitsOverview", () => {
  it("sums today's progress, the best running streak, this week's check-ins and the 30-day rate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 26, 10)); // Thursday
    try {
      const daily = { id: "a", title: "Read", color: "green", frequency: "daily", createdAt: "2026-01-01T00:00:00.000Z" } satisfies Habit;
      const sunday = { id: "b", title: "Call", color: "red", frequency: "days_of_week", frequencyDays: [0], createdAt: "2026-01-01T00:00:00.000Z" } satisfies Habit;
      const logs = [
        { habitId: "a", date: "2026-11-26", completedAt: "" },
        { habitId: "a", date: "2026-11-25", completedAt: "" },
        { habitId: "a", date: "2026-11-24", completedAt: "" },
        { habitId: "b", date: "2026-11-22", completedAt: "" }, // last Sunday, previous week
      ];
      const o = habitsOverview([daily, sunday], logs);
      expect(o.scheduledToday).toBe(1);
      expect(o.doneToday).toBe(1);
      expect(o.bestStreak).toEqual({ habitId: "a", title: "Read", days: 3 });
      expect(o.weekCheckIns).toBe(3); // Mon 23 … Thu 26
      expect(o.rate30).toBeGreaterThan(0);
      expect(o.rate30).toBeLessThanOrEqual(100);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is empty-safe", () => {
    const o = habitsOverview([], []);
    expect(o).toMatchObject({ scheduledToday: 0, doneToday: 0, bestStreak: null, weekCheckIns: 0, rate30: 0 });
  });
});
