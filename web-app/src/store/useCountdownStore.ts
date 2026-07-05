import { create } from "zustand";
import { countdownApi } from "@/api/client";
import type { CountdownCalendar, CountdownColor, CountdownEvent, CountdownRepeat } from "@/types/task";
import { toast } from "@/store/useToastStore";
import { t } from "@/i18n/useT";
import { clientId } from "@/lib/id";

function migrationKey(userId: string) {
  return `lumo.countdowns.migrated.v1.${userId}`;
}

function readLocalCountdowns(userId: string): CountdownEvent[] {
  try {
    const raw = localStorage.getItem(`lumo.countdowns.v1.${userId}`);
    return raw ? (JSON.parse(raw) as CountdownEvent[]) : [];
  } catch {
    return [];
  }
}

interface CountdownState {
  events: CountdownEvent[];
  loaded: boolean;
  load: (userId: string) => Promise<void>;
  clear: () => void;
  create: (userId: string, input: {
    title: string;
    date: string;
    emoji?: string;
    color: CountdownColor;
    repeat: CountdownRepeat;
    note?: string;
    calendar?: CountdownCalendar;
  }) => Promise<CountdownEvent>;
  update: (userId: string, id: string, patch: Partial<Omit<CountdownEvent, "id" | "createdAt">>) => Promise<void>;
  remove: (userId: string, id: string) => Promise<void>;
}

export const useCountdownStore = create<CountdownState>((set) => ({
  events: [],
  loaded: false,

  async load(userId) {
    if (userId === "local") { set({ events: [], loaded: true }); return; }

    // One-time migration from localStorage → server
    let migrationFailed = false;
    if (!localStorage.getItem(migrationKey(userId))) {
      const oldEvents = readLocalCountdowns(userId);
      if (oldEvents.length === 0) {
        // Nothing to migrate — mark done, skip the round-trip
        localStorage.setItem(migrationKey(userId), "1");
      } else {
        try {
          await countdownApi.migrate(userId, oldEvents);
          localStorage.setItem(migrationKey(userId), "1");
          localStorage.removeItem(`lumo.countdowns.v1.${userId}`);
        } catch {
          // Keep localStorage data intact — will retry on next load
          migrationFailed = true;
        }
      }
    }

    try {
      const events = await countdownApi.list(userId);
      // If migration never persisted and the server has nothing yet, show the
      // un-migrated local data rather than a misleading empty list (never
      // silently drop the user's data from the UI).
      if (migrationFailed && events.length === 0) {
        const localEvents = readLocalCountdowns(userId);
        if (localEvents.length > 0) {
          set({ events: localEvents, loaded: true });
          toast.error(t("countdown.error.load"));
          return;
        }
      }
      set({ events, loaded: true });
    } catch (e) {
      // Mark loaded even on failure so the page falls back to the empty state
      // (alongside the error toast) rather than trapping the user in a
      // never-ending loading skeleton (mirrors useProjectsStore.load #293).
      set({ loaded: true });
      toast.error(t("countdown.error.load"), e instanceof Error ? e.message : String(e));
    }
  },

  clear() {
    set({ events: [], loaded: false });
  },

  async create(userId, input) {
    const id = clientId("cd");
    try {
      const event = await countdownApi.create(userId, { ...input, calendar: input.calendar ?? "solar" }, id);
      set((s) => ({ events: [...s.events, event] }));
      return event;
    } catch (e) {
      toast.error(t("countdown.error.create"), e instanceof Error ? e.message : String(e));
      throw e;
    }
  },

  async update(userId, id, patch) {
    try {
      const updated = await countdownApi.update(userId, id, patch);
      set((s) => ({ events: s.events.map((e) => (e.id === id ? updated : e)) }));
    } catch (e) {
      toast.error(t("countdown.error.update"), e instanceof Error ? e.message : String(e));
      // Re-throw (like create) so the edit form stays open for retry instead of
      // closing as though the save succeeded.
      throw e;
    }
  },

  async remove(userId, id) {
    try {
      await countdownApi.delete(userId, id);
      set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
      toast.success(t("countdown.deleted"));
    } catch (e) {
      toast.error(t("countdown.error.delete"), e instanceof Error ? e.message : String(e));
    }
  },
}));
