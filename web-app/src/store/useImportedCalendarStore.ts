import { create } from "zustand";
import { persist } from "zustand/middleware";
import { parseICS, type ImportedEvent } from "@/lib/icsParse";

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
        const { events, hadRecurrence } = parseICS(text);
        set({ events, sourceName, hadRecurrence, importedAt: Date.now() });
        return events.length;
      },
      clear: () => set({ events: [], sourceName: null, importedAt: null, hadRecurrence: false }),
    }),
    { name: "lumo-imported-calendar" },
  ),
);
