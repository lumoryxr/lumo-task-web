import { describe, it, expect } from "vitest";
import { parseICS } from "../icsParse";

const wrap = (body: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;

const vevent = (props: string) => `BEGIN:VEVENT\r\n${props}\r\nEND:VEVENT`;

describe("parseICS", () => {
  it("parses a timed UTC event", () => {
    const { events } = parseICS(
      wrap(vevent("UID:a@x\r\nSUMMARY:Standup\r\nDTSTART:20260710T090000Z\r\nDTEND:20260710T093000Z")),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "a@x",
      subject: "Standup",
      startISO: "2026-07-10T09:00:00Z",
      endISO: "2026-07-10T09:30:00Z",
      isAllDay: false,
    });
  });

  it("parses an all-day (VALUE=DATE) event with a date-only ISO", () => {
    const { events } = parseICS(
      wrap(vevent("UID:b@x\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20261225\r\nDTEND;VALUE=DATE:20261226")),
    );
    expect(events[0]).toMatchObject({
      startISO: "2026-12-25",
      endISO: "2026-12-26",
      isAllDay: true,
    });
  });

  it("defaults a missing all-day DTEND to the next day", () => {
    const { events } = parseICS(wrap(vevent("UID:c\r\nSUMMARY:X\r\nDTSTART;VALUE=DATE:20261231")));
    expect(events[0]).toMatchObject({ startISO: "2026-12-31", endISO: "2027-01-01", isAllDay: true });
  });

  it("defaults a missing timed DTEND to the start", () => {
    const { events } = parseICS(wrap(vevent("UID:d\r\nSUMMARY:X\r\nDTSTART:20260101T120000Z")));
    expect(events[0].endISO).toBe("2026-01-01T12:00:00Z");
  });

  it("unescapes SUMMARY text (comma, semicolon, newline, backslash)", () => {
    const { events } = parseICS(
      wrap(vevent("UID:e\r\nSUMMARY:Meet Bob\\, bring notes\\; and a pen\\nline2\r\nDTSTART:20260101T100000Z")),
    );
    // Embedded newline is flattened to a space for a one-line busy title.
    expect(events[0].subject).toBe("Meet Bob, bring notes; and a pen line2");
  });

  it("unfolds continuation lines (folded SUMMARY)", () => {
    const folded =
      "BEGIN:VEVENT\r\nUID:f\r\nSUMMARY:This is a very long summary that the\r\n  calendar folded across lines\r\nDTSTART:20260101T100000Z\r\nEND:VEVENT";
    const { events } = parseICS(wrap(folded));
    expect(events[0].subject).toBe("This is a very long summary that the calendar folded across lines");
  });

  it("parses multiple events", () => {
    const { events } = parseICS(
      wrap(
        vevent("UID:1\r\nSUMMARY:One\r\nDTSTART:20260101T100000Z") +
          "\r\n" +
          vevent("UID:2\r\nSUMMARY:Two\r\nDTSTART:20260102T100000Z"),
      ),
    );
    expect(events.map((e) => e.subject)).toEqual(["One", "Two"]);
  });

  it("flags recurrence but still includes the first instance (no expansion in V2)", () => {
    const { events, hadRecurrence } = parseICS(
      wrap(vevent("UID:r\r\nSUMMARY:Weekly\r\nDTSTART:20260101T100000Z\r\nRRULE:FREQ=WEEKLY;COUNT=10")),
    );
    expect(hadRecurrence).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].subject).toBe("Weekly");
  });

  it("skips a VEVENT with no DTSTART", () => {
    const { events } = parseICS(wrap(vevent("UID:z\r\nSUMMARY:No start")));
    expect(events).toHaveLength(0);
  });

  it("synthesizes an id when UID is absent and falls back to a busy title", () => {
    const { events } = parseICS(wrap(vevent("DTSTART:20260101T100000Z")));
    expect(events[0].id).toMatch(/^ics-\d+$/);
    expect(events[0].subject).toBe("(busy)");
  });

  it("ignores a TZID param and reads the wall-clock time", () => {
    const { events } = parseICS(
      wrap(vevent("UID:t\r\nSUMMARY:Local\r\nDTSTART;TZID=America/New_York:20260701T140000")),
    );
    expect(events[0]).toMatchObject({ startISO: "2026-07-01T14:00:00", isAllDay: false });
  });

  it("never throws on empty or garbage input", () => {
    expect(parseICS("")).toEqual({ events: [], hadRecurrence: false });
    expect(parseICS("not a calendar at all")).toEqual({ events: [], hadRecurrence: false });
    expect(() => parseICS(undefined as unknown as string)).not.toThrow();
  });

  it("drops a malformed DTSTART value rather than emitting a bad event", () => {
    const { events } = parseICS(wrap(vevent("UID:bad\r\nSUMMARY:Bad\r\nDTSTART:not-a-date")));
    expect(events).toHaveLength(0);
  });
});
