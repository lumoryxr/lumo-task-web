import { describe, it, expect } from "vitest";
import { todayBusyHours } from "@/utils/calendarBusy";
import type { ImportedEvent } from "@/lib/icsParse";

// Fixed "now": 2026-07-07 (local). Build ISO strings for that local day.
const NOW = new Date(2026, 6, 7, 9, 0, 0);
const iso = (h: number, m = 0) => new Date(2026, 6, 7, h, m, 0).toISOString();

function ev(partial: Partial<ImportedEvent>): ImportedEvent {
  return { id: "e", subject: "busy", startISO: iso(10), endISO: iso(11), isAllDay: false, ...partial };
}

describe("todayBusyHours", () => {
  it("sums timed events that fall today", () => {
    const events = [
      ev({ startISO: iso(9), endISO: iso(10, 30) }), // 1.5h
      ev({ startISO: iso(14), endISO: iso(15) }), // 1h
    ];
    expect(todayBusyHours(events, NOW)).toBeCloseTo(2.5, 5);
  });

  it("excludes all-day events", () => {
    const events = [ev({ isAllDay: true, startISO: iso(0), endISO: iso(23, 59) })];
    expect(todayBusyHours(events, NOW)).toBe(0);
  });

  it("ignores events on other days", () => {
    const tomorrow = new Date(2026, 6, 8, 10).toISOString();
    const tomorrowEnd = new Date(2026, 6, 8, 12).toISOString();
    expect(todayBusyHours([ev({ startISO: tomorrow, endISO: tomorrowEnd })], NOW)).toBe(0);
  });

  it("counts only the portion overlapping today for a midnight-spanning event", () => {
    // Starts 23:00 today, ends 01:00 tomorrow → only 1h counts.
    const start = new Date(2026, 6, 7, 23).toISOString();
    const end = new Date(2026, 6, 8, 1).toISOString();
    expect(todayBusyHours([ev({ startISO: start, endISO: end })], NOW)).toBeCloseTo(1, 5);
  });

  it("ignores malformed or zero-length events", () => {
    const events = [
      ev({ startISO: "not-a-date", endISO: iso(11) }),
      ev({ startISO: iso(10), endISO: iso(10) }), // zero length
      ev({ startISO: iso(12), endISO: iso(11) }), // end before start
    ];
    expect(todayBusyHours(events, NOW)).toBe(0);
  });

  it("clamps to at most 24h", () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      ev({ id: `e${i}`, startISO: iso(0), endISO: iso(23, 59) }),
    );
    expect(todayBusyHours(events, NOW)).toBeLessThanOrEqual(24);
  });
});
