/**
 * Unit · ics builder (#169 V1) — pure RFC 5545 generation, no HTTP/DB.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildICS, escapeICSText, foldLine, icsTimestamp } from "../../lib/ics.js";

const STAMP = "20260707T090000Z";

describe("ics · escapeICSText", () => {
  test("escapes backslash, semicolon, comma, and newline", () => {
    assert.equal(escapeICSText("a,b;c\\d"), "a\\,b\\;c\\\\d");
    assert.equal(escapeICSText("line1\nline2"), "line1\\nline2");
    assert.equal(escapeICSText("crlf\r\nhere"), "crlf\\nhere");
  });
});

describe("ics · foldLine", () => {
  test("short lines are untouched", () => {
    assert.equal(foldLine("SUMMARY:hi"), "SUMMARY:hi");
  });
  test("lines over 75 octets fold with CRLF + space", () => {
    const long = "SUMMARY:" + "x".repeat(100);
    const folded = foldLine(long);
    assert.ok(folded.includes("\r\n "), "expected a fold");
    // Unfolding (strip CRLF+space) restores the original.
    assert.equal(folded.replace(/\r\n /g, ""), long);
  });
  test("does not split a multibyte character across a fold", () => {
    const long = "SUMMARY:" + "。".repeat(60); // 3 bytes each
    const folded = foldLine(long);
    // Each unfolded segment must still be valid UTF-8 round-tripping to source.
    assert.equal(folded.replace(/\r\n /g, ""), long);
  });
});

describe("ics · buildICS", () => {
  test("wraps events in a VCALENDAR with all-day VEVENTs", () => {
    const ics = buildICS({
      calName: "Lumo — Jalen",
      dtstamp: STAMP,
      events: [{ uid: "task-1@lumo", summary: "Ship it", date: "2026-07-10" }],
    });
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(ics.includes("VERSION:2.0"));
    assert.ok(ics.includes("BEGIN:VEVENT"));
    assert.ok(ics.includes("UID:task-1@lumo"));
    assert.ok(ics.includes(`DTSTAMP:${STAMP}`));
    assert.ok(ics.includes("DTSTART;VALUE=DATE:20260710"));
    assert.ok(ics.includes("DTEND;VALUE=DATE:20260711"), "all-day DTEND is next day");
    assert.ok(ics.includes("SUMMARY:Ship it"));
    assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
    assert.ok(ics.endsWith("\r\n"));
  });

  test("DTEND rolls over month/year boundaries", () => {
    const ics = buildICS({
      calName: "c",
      dtstamp: STAMP,
      events: [{ uid: "u@lumo", summary: "NYE", date: "2026-12-31" }],
    });
    assert.ok(ics.includes("DTSTART;VALUE=DATE:20261231"));
    assert.ok(ics.includes("DTEND;VALUE=DATE:20270101"));
  });

  test("escapes the summary and calendar name", () => {
    const ics = buildICS({
      calName: "A, B",
      dtstamp: STAMP,
      events: [{ uid: "u@lumo", summary: "Meet Bob; bring notes, please", date: "2026-01-01" }],
    });
    assert.ok(ics.includes("X-WR-CALNAME:A\\, B"));
    assert.ok(ics.includes("SUMMARY:Meet Bob\\; bring notes\\, please"));
  });

  test("skips malformed AND well-formed-but-nonexistent dates", () => {
    const ics = buildICS({
      calName: "c",
      dtstamp: STAMP,
      events: [
        { uid: "good@lumo", summary: "ok", date: "2026-05-05" },
        { uid: "garbage@lumo", summary: "nope", date: "not-a-date" },
        { uid: "feb30@lumo", summary: "impossible", date: "2026-02-30" },
        { uid: "month13@lumo", summary: "impossible", date: "2026-13-01" },
      ],
    });
    assert.ok(ics.includes("UID:good@lumo"));
    assert.ok(!ics.includes("garbage@lumo"));
    assert.ok(!ics.includes("feb30@lumo"), "Feb 30 does not exist → skipped");
    assert.ok(!ics.includes("month13@lumo"), "month 13 does not exist → skipped");
    assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 1);
  });

  test("accepts a real leap day", () => {
    const ics = buildICS({
      calName: "c",
      dtstamp: STAMP,
      events: [{ uid: "leap@lumo", summary: "leap", date: "2028-02-29" }],
    });
    assert.ok(ics.includes("DTSTART;VALUE=DATE:20280229"));
    assert.ok(ics.includes("DTEND;VALUE=DATE:20280301"));
  });

  test("empty event list still produces a valid empty calendar", () => {
    const ics = buildICS({ calName: "c", dtstamp: STAMP, events: [] });
    assert.ok(ics.includes("BEGIN:VCALENDAR"));
    assert.ok(!ics.includes("BEGIN:VEVENT"));
    assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
  });
});

describe("ics · icsTimestamp", () => {
  test("formats a Date as UTC YYYYMMDDTHHMMSSZ", () => {
    assert.equal(icsTimestamp(new Date("2026-07-07T09:00:00.123Z")), "20260707T090000Z");
  });
});
