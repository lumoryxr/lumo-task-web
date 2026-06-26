import { describe, it, expect, afterEach, vi } from "vitest";
import { daysUntil, fmtDate } from "../countdown";

function setToday(dateStr: string) {
  const fixed = new Date(dateStr + "T00:00:00");
  vi.useFakeTimers();
  vi.setSystemTime(fixed);
}

describe("daysUntil", () => {
  afterEach(() => vi.useRealTimers());

  describe("repeat=none", () => {
    it("returns 0 for today", () => {
      setToday("2026-05-21");
      expect(daysUntil("2026-05-21", "none")).toBe(0);
    });

    it("returns positive for a future date", () => {
      setToday("2026-05-21");
      expect(daysUntil("2026-05-25", "none")).toBe(4);
    });

    it("returns negative for a past date", () => {
      setToday("2026-05-21");
      expect(daysUntil("2026-05-10", "none")).toBe(-11);
    });
  });

  describe("repeat=yearly", () => {
    it("returns days until occurrence this year when not yet passed", () => {
      setToday("2026-01-01");
      // Jan 1 → Dec 25 in 2026 (non-leap year) = 358 days
      expect(daysUntil("2025-12-25", "yearly")).toBe(358);
    });

    it("returns 0 when anniversary is today", () => {
      setToday("2026-08-14");
      expect(daysUntil("2000-08-14", "yearly")).toBe(0);
    });

    it("rolls to next year when this year's date has passed", () => {
      setToday("2026-05-21");
      // Birthday was May 10; next occurrence is May 10 next year (355 days)
      const result = daysUntil("2000-05-10", "yearly");
      expect(result).toBeGreaterThan(0);
      // next May 10 from May 21 = ~354 days
      expect(result).toBe(354);
    });

    it("handles Feb 29 in non-leap year by clamping to Feb 28", () => {
      setToday("2026-01-01"); // 2026 is not a leap year
      const result = daysUntil("2000-02-29", "yearly");
      // Should be days until Feb 28, 2026 (not overflow to March 1)
      const feb28 = new Date("2026-02-28T00:00:00").getTime();
      const jan1  = new Date("2026-01-01T00:00:00").getTime();
      const expected = Math.round((feb28 - jan1) / 86_400_000);
      expect(result).toBe(expected);
    });

    it("handles Feb 29 in a leap year correctly", () => {
      setToday("2028-01-01"); // 2028 IS a leap year
      const result = daysUntil("2000-02-29", "yearly");
      const feb29 = new Date("2028-02-29T00:00:00").getTime();
      const jan1  = new Date("2028-01-01T00:00:00").getTime();
      const expected = Math.round((feb29 - jan1) / 86_400_000);
      expect(result).toBe(expected);
    });
  });

  describe("calendar=lunar", () => {
    it("repeat=none uses the solar anchor directly", () => {
      setToday("2026-06-01");
      // anchor solar 2026-06-15 (lunar 五月初一), one-time → plain solar diff
      expect(daysUntil("2026-06-15", "none", "lunar")).toBe(14);
    });

    it("repeat=yearly counts to the next lunar occurrence", () => {
      setToday("2026-07-01");
      // this year's lunar 五月初一 (2026-06-15) has passed → next is 2027-06-05
      const days = daysUntil("2026-06-15", "yearly", "lunar");
      const expected = Math.round(
        (new Date("2027-06-05T00:00:00").getTime() - new Date("2026-07-01T00:00:00").getTime()) / 86_400_000,
      );
      expect(days).toBe(expected);
    });

    it("falls back to solar handling for an out-of-range anchor", () => {
      setToday("1800-01-01");
      // lunar conversion unavailable < 1900 → behaves like a solar one-time date
      expect(daysUntil("1800-01-10", "none", "lunar")).toBe(9);
    });
  });
});

describe("fmtDate", () => {
  it("includes year for one-time events", () => {
    const result = fmtDate("2026-12-25", "none", "en");
    expect(result).toMatch(/2026/);
  });

  it("omits year for yearly events", () => {
    const result = fmtDate("2026-12-25", "yearly", "en");
    expect(result).not.toMatch(/2026/);
  });

  it("uses zh-CN locale when locale is zh", () => {
    const result = fmtDate("2026-12-25", "none", "zh");
    expect(result).toMatch(/12/);
    expect(result).toMatch(/25/);
  });

  it("renders a lunar event as its Chinese lunar date", () => {
    // one-time lunar event includes the lunar year
    expect(fmtDate("2026-06-15", "none", "zh", "lunar")).toBe("二零二六年五月初一");
    // yearly lunar event omits the year
    expect(fmtDate("2026-06-15", "yearly", "en", "lunar")).toBe("五月初一");
  });

  it("falls back to the solar label when lunar conversion is unavailable", () => {
    const result = fmtDate("1800-12-25", "none", "en", "lunar");
    expect(result).toMatch(/1800/);
  });
});
