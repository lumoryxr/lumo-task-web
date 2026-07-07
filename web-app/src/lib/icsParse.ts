/**
 * Minimal iCalendar (RFC 5545) parser for #169 V2 — importing an external
 * calendar as read-only "busy" context. Pure and framework-free so it is
 * unit-testable in isolation.
 *
 * Scope (deliberately small for V2): single-occurrence VEVENTs with a DTSTART
 * (all-day DATE or DATE-TIME). RRULE recurrence is NOT expanded — a recurring
 * event surfaces only as its first instance; `hadRecurrence` reports whether any
 * were skipped so the UI can note it. VTIMEZONE offsets are not resolved:
 * floating/again TZID local times are read as wall-clock, UTC (`Z`) is exact.
 */

export interface ImportedEvent {
  /** Stable id: the VEVENT UID, or a synthesized fallback. */
  id: string;
  subject: string;
  /** ISO 8601. All-day events use a date-only `YYYY-MM-DD`. */
  startISO: string;
  endISO: string;
  isAllDay: boolean;
}

export interface ParseResult {
  events: ImportedEvent[];
  /** True if any VEVENT carried an RRULE (only its first instance is included). */
  hadRecurrence: boolean;
}

/** Unfold RFC 5545 continuation lines (a line starting with space/tab continues the previous). */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Unescape RFC 5545 TEXT: \\ \; \, and \n / \N (newline). */
function unescapeText(s: string): string {
  return s.replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

/** Split a content line into { name, params, value } on the first unquoted colon. */
function splitLine(line: string): { name: string; params: string; value: string } | null {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ":" && !inQuote) {
      const left = line.slice(0, i);
      const value = line.slice(i + 1);
      const semi = left.indexOf(";");
      return semi === -1
        ? { name: left.toUpperCase(), params: "", value }
        : { name: left.slice(0, semi).toUpperCase(), params: left.slice(semi + 1), value };
    }
  }
  return null;
}

/** True only for a real calendar date (rejects e.g. 2026-02-30, 2026-13-01). */
function isRealDate(y: number, mo: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Parse a DATE (`YYYYMMDD`) or DATE-TIME (`YYYYMMDDTHHMMSS[Z]`) value to ISO. */
function parseDateValue(value: string, params: string): { iso: string; allDay: boolean } | null {
  const v = value.trim();
  const isDateParam = /VALUE=DATE(?![-])/i.test(params);
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly && (isDateParam || !v.includes("T"))) {
    if (!isRealDate(+dateOnly[1], +dateOnly[2], +dateOnly[3])) return null;
    return { iso: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, allDay: true };
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (dt) {
    const [, y, mo, d, h, mi, s, z] = dt;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? "Z" : ""}`;
    // Validate it's a real instant.
    if (Number.isNaN(Date.parse(z ? iso : `${iso}Z`))) return null;
    return { iso, allDay: false };
  }
  return null;
}

/** Add one day to a `YYYY-MM-DD` (for a missing all-day DTEND). */
function nextDay(dateISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!m) return dateISO;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Parse an .ics document into normalized events. Never throws on malformed input. */
export function parseICS(text: string): ParseResult {
  const lines = unfold(text ?? "");
  const events: ImportedEvent[] = [];
  let hadRecurrence = false;

  let inEvent = false;
  let cur: Partial<ImportedEvent> & { rrule?: boolean } = {};
  let fallback = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      cur = {};
      continue;
    }
    if (trimmed === "END:VEVENT") {
      inEvent = false;
      if (cur.rrule) hadRecurrence = true;
      if (cur.startISO) {
        // Default a missing DTEND: all-day → next day; timed → same as start.
        const endISO = cur.endISO ?? (cur.isAllDay ? nextDay(cur.startISO) : cur.startISO);
        events.push({
          id: cur.id || `ics-${fallback++}`,
          subject: cur.subject || "(busy)",
          startISO: cur.startISO,
          endISO,
          isAllDay: !!cur.isAllDay,
        });
      }
      continue;
    }
    if (!inEvent) continue;

    const p = splitLine(line);
    if (!p) continue;
    switch (p.name) {
      case "UID":
        cur.id = p.value.trim();
        break;
      case "SUMMARY":
        cur.subject = unescapeText(p.value).replace(/\n/g, " ").trim();
        break;
      case "DTSTART": {
        const parsed = parseDateValue(p.value, p.params);
        if (parsed) {
          cur.startISO = parsed.iso;
          cur.isAllDay = parsed.allDay;
        }
        break;
      }
      case "DTEND": {
        const parsed = parseDateValue(p.value, p.params);
        if (parsed) cur.endISO = parsed.iso;
        break;
      }
      case "RRULE":
        cur.rrule = true;
        break;
    }
  }

  return { events, hadRecurrence };
}
