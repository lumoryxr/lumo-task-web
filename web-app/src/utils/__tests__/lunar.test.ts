import { describe, it, expect } from "vitest";
import {
  solarISOToLunar,
  lunarToSolarISO,
  formatLunarISO,
  nextLunarYearlyISO,
  isLunarSupportedYear,
  lunarLeapMonth,
  lunarDaysInMonth,
  lunarMonthLabel,
  lunarDayLabel,
  lunarMonthOptions,
} from "../lunar";

describe("lunar conversions", () => {
  it("converts a solar anchor to its lunar parts", () => {
    const lp = solarISOToLunar("2026-06-26");
    expect(lp).not.toBeNull();
    expect(lp!.lMonth).toBe(5);
    expect(lp!.lDay).toBe(12);
    expect(lp!.isLeap).toBe(false);
  });

  it("converts lunar (year, month, day) to a solar ISO anchor", () => {
    expect(lunarToSolarISO(2026, 5, 1, false)).toBe("2026-06-15");
  });

  it("round-trips solar → lunar → solar", () => {
    const lp = solarISOToLunar("2026-06-15")!;
    expect(lunarToSolarISO(lp.lYear, lp.lMonth, lp.lDay, lp.isLeap)).toBe("2026-06-15");
  });

  it("formats a lunar date with and without the year", () => {
    expect(formatLunarISO("2026-06-15")).toBe("五月初一");
    expect(formatLunarISO("2026-06-15", { withYear: true })).toBe("二零二六年五月初一");
  });

  it("guards the supported year range (1900–2100)", () => {
    expect(isLunarSupportedYear(1899)).toBe(false);
    expect(isLunarSupportedYear(2101)).toBe(false);
    expect(solarISOToLunar("1800-01-01")).toBeNull();
    expect(lunarToSolarISO(2200, 1, 1)).toBeNull();
    expect(formatLunarISO("1800-01-01")).toBeNull();
  });

  it("rejects unparseable input", () => {
    expect(solarISOToLunar("not-a-date")).toBeNull();
  });
});

describe("nextLunarYearlyISO", () => {
  it("returns this year's occurrence when it is still ahead", () => {
    // anchor = lunar 五月初一 (solar 2026-06-15); asking from earlier that year
    const next = nextLunarYearlyISO("2026-06-15", new Date("2026-06-01T00:00:00"));
    expect(next).toBe("2026-06-15");
  });

  it("rolls to next year's lunar occurrence once this year's has passed", () => {
    const next = nextLunarYearlyISO("2026-06-15", new Date("2026-07-01T00:00:00"));
    expect(next).toBe("2027-06-05"); // lunar 五月初一 of 2027
    // and it is genuinely the same lunar month/day
    const lp = solarISOToLunar(next!)!;
    expect([lp.lMonth, lp.lDay]).toEqual([5, 1]);
  });

  it("clamps day 30 to the last day in a short (29-day) lunar month", () => {
    // anchor = lunar 2024 五月三十 (solar 2024-07-05). Lunar month 5 has only
    // 29 days in 2025, so the 2025 occurrence clamps to 廿九 → solar 2025-06-24.
    const next = nextLunarYearlyISO("2024-07-05", new Date("2025-01-01T00:00:00"));
    expect(next).toBe("2025-06-24");
    expect(solarISOToLunar(next!)!.lDay).toBe(29);
  });

  it("returns null for an out-of-range anchor so callers fall back to solar", () => {
    expect(nextLunarYearlyISO("1800-01-01", new Date("2026-01-01T00:00:00"))).toBeNull();
  });
});

describe("picker helpers", () => {
  it("reports the leap month of a year (0 when none)", () => {
    expect(lunarLeapMonth(2025)).toBe(6); // 2025 has a leap 6th month
    expect(lunarLeapMonth(2026)).toBe(0); // 2026 has none
    expect(lunarLeapMonth(1800)).toBe(0); // out of range → 0
  });

  it("returns the day count of a lunar month, leap-aware", () => {
    expect(lunarDaysInMonth(2025, 6, false)).toBe(30); // regular 六月
    expect(lunarDaysInMonth(2025, 6, true)).toBe(29); // leap 闰六月
    expect(lunarDaysInMonth(2026, 5, false)).toBe(29); // 2026 五月 is short
    expect(lunarDaysInMonth(1800, 1, false)).toBe(0); // out of range → 0
  });

  it("labels months in Chinese, prefixing 闰 for a leap month", () => {
    expect(lunarMonthLabel(1, false)).toBe("正月");
    expect(lunarMonthLabel(12, false)).toBe("腊月");
    expect(lunarMonthLabel(6, true)).toBe("闰六月");
  });

  it("labels days in Chinese", () => {
    expect(lunarDayLabel(1)).toBe("初一");
    expect(lunarDayLabel(29)).toBe("廿九");
    expect(lunarDayLabel(30)).toBe("三十");
  });

  it("builds the month option list, inserting the leap month after its regular month", () => {
    const opts = lunarMonthOptions(2025); // leap month = 6
    expect(opts).toHaveLength(13);
    // regular 六月 at index 5, leap 闰六月 immediately after
    expect(opts[5]).toMatchObject({ lMonth: 6, isLeap: false, label: "六月" });
    expect(opts[6]).toMatchObject({ lMonth: 6, isLeap: true, label: "闰六月" });
    // every regular month present, in order
    expect(opts.filter((o) => !o.isLeap).map((o) => o.lMonth)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("builds a 12-entry month list for a year with no leap month", () => {
    const opts = lunarMonthOptions(2026); // no leap
    expect(opts).toHaveLength(12);
    expect(opts.every((o) => !o.isLeap)).toBe(true);
  });
});
