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

/** Format a UTC Date as an RFC 5545 `YYYYMMDD` DATE value. */
function fmtICSDate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${mo}${da}`;
}

/**
 * Parse a strict `YYYY-MM-DD` into a UTC Date, rejecting well-formed but
 * non-existent dates (e.g. `2026-02-30`, `2026-13-01`) — the contract regex
 * only checks shape, so this is the real-calendar-date guard. Returns null on
 * anything that doesn't round-trip.
 */
function parseICSDate(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(y, mo - 1, da));
  // A rolled-over date (Feb 30 → Mar 2) won't match its own parts.
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) return null;
  return d;
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
    const startDate = parseICSDate(ev.date);
    if (!startDate) continue; // skip malformed / non-existent dates
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1); // all-day DTEND is exclusive
    lines.push(
      "BEGIN:VEVENT",
      foldLine(`UID:${ev.uid}`),
      `DTSTAMP:${opts.dtstamp}`,
      `DTSTART;VALUE=DATE:${fmtICSDate(startDate)}`,
      `DTEND;VALUE=DATE:${fmtICSDate(endDate)}`,
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
