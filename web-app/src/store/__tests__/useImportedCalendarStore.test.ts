import { describe, it, expect, beforeEach } from "vitest";
import { useImportedCalendarStore } from "../useImportedCalendarStore";

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
