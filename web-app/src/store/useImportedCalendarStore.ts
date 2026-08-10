import { create } from "zustand";
import { persist } from "zustand/middleware";
import { parseICS, type ImportedEvent } from "@/lib/icsParse";

/**
 * Neutral calendar-event shape shared by the calendar week view and its event
 * card (`CalendarEventCard`). Owned here so the local ICS-import overlay has no
 * dependency on any third-party calendar integration.
 */
export interface CalendarEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName: string };
  isAllDay?: boolean;
}

/**
 * Adapt an imported event to the CalendarEvent shape so it can render through the
 * shared CalendarEventCard / calendar bucketing. The id is prefixed so it never
 * collides with any other event's id.
 */
export function importedToBusyEvent(ev: ImportedEvent): CalendarEvent {
  return {
    id: `imported-${ev.id}`,
    subject: ev.subject,
    start: { dateTime: ev.startISO, timeZone: "UTC" },
    end: { dateTime: ev.endISO, timeZone: "UTC" },
    isAllDay: ev.isAllDay,
  };
}

/**
 * Cap on stored events so a huge multi-year .ics can't blow the ~5MB
 * localStorage quota (which would make persist throw). Busy context only needs
 * a bounded window; extras are dropped (earliest-in-file kept).
 */
const MAX_IMPORTED_EVENTS = 1000;

/**
 * Imported external calendar (#169 V2). Holds the read-only events parsed from a
 * user-uploaded .ics file so they can surface as "busy" context (and feed
 * calendar-aware planning, #172 V2). Purely client-side — no server fetch, so no
 * SSRF surface. Persisted so the import survives reloads.
 */
interface ImportedCalendarStore {
  events: ImportedEvent[];
  sourceName: string | null;
  importedAt: number | null;
  /** True if the source had recurring events (only first instances are kept). */
  hadRecurrence: boolean;
  /** Parse an .ics document and replace the current import. Returns the count. */
  importIcs: (text: string, sourceName: string) => number;
  clear: () => void;
}

export const useImportedCalendarStore = create<ImportedCalendarStore>()(
  persist(
    (set) => ({
      events: [],
      sourceName: null,
      importedAt: null,
      hadRecurrence: false,
      importIcs: (text, sourceName) => {
        const parsed = parseICS(text);
        const events = parsed.events.slice(0, MAX_IMPORTED_EVENTS);
        set({ events, sourceName, hadRecurrence: parsed.hadRecurrence, importedAt: Date.now() });
        return events.length;
      },
      clear: () => set({ events: [], sourceName: null, importedAt: null, hadRecurrence: false }),
    }),
    { name: "lumo-imported-calendar" },
  ),
);
