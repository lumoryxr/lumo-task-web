import { describe, it, expect, beforeEach } from "vitest";
import { useImportedCalendarStore, importedToBusyEvent } from "../useImportedCalendarStore";

const ICS =
  "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Meeting\r\nDTSTART:20260101T100000Z\r\nDTEND:20260101T110000Z\r\n" +
  "RRULE:FREQ=WEEKLY\r\nEND:VEVENT\r\nEND:VCALENDAR";

beforeEach(() => {
  useImportedCalendarStore.getState().clear();
});

describe("useImportedCalendarStore", () => {
  it("importIcs parses events, records source + recurrence, and returns the count", () => {
    const n = useImportedCalendarStore.getState().importIcs(ICS, "work.ics");
    expect(n).toBe(1);
    const s = useImportedCalendarStore.getState();
    expect(s.events[0]).toMatchObject({ subject: "Meeting", isAllDay: false });
    expect(s.sourceName).toBe("work.ics");
    expect(s.hadRecurrence).toBe(true);
    expect(s.importedAt).toBeGreaterThan(0);
  });

  it("a new import replaces the previous one", () => {
    useImportedCalendarStore.getState().importIcs(ICS, "work.ics");
    const single =
      "BEGIN:VEVENT\r\nUID:2\r\nSUMMARY:Solo\r\nDTSTART;VALUE=DATE:20260202\r\nEND:VEVENT";
    const n = useImportedCalendarStore.getState().importIcs(single, "home.ics");
    expect(n).toBe(1);
    expect(useImportedCalendarStore.getState().sourceName).toBe("home.ics");
    expect(useImportedCalendarStore.getState().hadRecurrence).toBe(false);
  });

  it("caps stored events to bound localStorage on a huge import", () => {
    let body = "BEGIN:VCALENDAR\r\n";
    for (let i = 0; i < 1500; i++) {
      body += `BEGIN:VEVENT\r\nUID:${i}\r\nSUMMARY:E${i}\r\nDTSTART:20260101T100000Z\r\nEND:VEVENT\r\n`;
    }
    body += "END:VCALENDAR";
    const n = useImportedCalendarStore.getState().importIcs(body, "huge.ics");
    expect(n).toBe(1000);
    expect(useImportedCalendarStore.getState().events).toHaveLength(1000);
  });

  it("importedToBusyEvent adapts to the CalendarEvent shape with a collision-safe id", () => {
    const busy = importedToBusyEvent({
      id: "1",
      subject: "Dentist",
      startISO: "2026-07-10T09:00:00Z",
      endISO: "2026-07-10T10:00:00Z",
      isAllDay: false,
    });
    expect(busy.id).toBe("imported-1"); // prefixed so it can't clash with another event id
    expect(busy.subject).toBe("Dentist");
    // Calendar buckets by start.dateTime.substring(0,10) → must be the event's day.
    expect(busy.start.dateTime.substring(0, 10)).toBe("2026-07-10");
    expect(busy.isAllDay).toBe(false);
  });

  it("an all-day imported event keeps a date-only start (buckets to its day)", () => {
    const busy = importedToBusyEvent({
      id: "x", subject: "Trip", startISO: "2026-12-25", endISO: "2026-12-26", isAllDay: true,
    });
    expect(busy.start.dateTime.substring(0, 10)).toBe("2026-12-25");
    expect(busy.isAllDay).toBe(true);
  });

  it("clear resets everything", () => {
    useImportedCalendarStore.getState().importIcs(ICS, "work.ics");
    useImportedCalendarStore.getState().clear();
    const s = useImportedCalendarStore.getState();
    expect(s.events).toEqual([]);
    expect(s.sourceName).toBeNull();
    expect(s.importedAt).toBeNull();
    expect(s.hadRecurrence).toBe(false);
  });
});
