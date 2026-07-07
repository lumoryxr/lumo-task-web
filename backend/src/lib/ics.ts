/**
 * Pure iCalendar (RFC 5545) builder for the read-only calendar feed (#169 V1).
 * No DB/HTTP so it is unit-testable in isolation. The feed exposes all-day
 * VEVENTs (task due dates + countdown events), so every event is a DATE value,
 * not a DATE-TIME.
 */

export interface ICSEvent {
  /** Globally-stable unique id (e.g. `task-<id>@lumo`). */
  uid: string;
  /** Human title (unescaped — this builder escapes it). */
  summary: string;
  /** All-day anchor, `YYYY-MM-DD`. */
  date: string;
}

/** Escape TEXT per RFC 5545 §3.3.11: backslash, semicolon, comma, newline. */
export function escapeICSText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

/**
 * Fold a content line to ≤75 octets per RFC 5545 §3.1, continuing with a space.
 * Folds on octet (UTF-8 byte) boundaries so multibyte chars are never split.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  // First line: 75 octets. Continuations: 74 (leading space counts toward 75).
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Don't split a multibyte sequence: back off while the next byte is a
    // UTF-8 continuation byte (10xxxxxx).
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74;
  }
  return parts.join("\r\n ");
}

/** `YYYY-MM-DD` → `YYYYMMDD` (RFC 5545 DATE form). Returns null if malformed. */
function toICSDate(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/** All-day DTEND is exclusive, so it is the day after DTSTART. */
function nextDayICSDate(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + 1);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${mo}${da}`;
}

/**
 * Build a complete VCALENDAR document. `dtstamp` is a UTC `YYYYMMDDTHHMMSSZ`
 * timestamp (caller-supplied so it can be pinned in tests). Events with a
 * malformed date are skipped rather than emitting an invalid VEVENT.
 */
export function buildICS(opts: {
  calName: string;
  events: ICSEvent[];
  dtstamp: string;
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lumo//Task Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeICSText(opts.calName)}`),
  ];
  for (const ev of opts.events) {
    const start = toICSDate(ev.date);
    const end = nextDayICSDate(ev.date);
    if (!start || !end) continue;
    lines.push(
      "BEGIN:VEVENT",
      foldLine(`UID:${ev.uid}`),
      `DTSTAMP:${opts.dtstamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      foldLine(`SUMMARY:${escapeICSText(ev.summary)}`),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** UTC `YYYYMMDDTHHMMSSZ` for a Date (DTSTAMP form). */
export function icsTimestamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
