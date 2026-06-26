import { describe, it, expect } from "vitest";
import {
  solarISOToLunar,
  lunarToSolarISO,
  formatLunarISO,
  nextLunarYearlyISO,
  isLunarSupportedYear,
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
