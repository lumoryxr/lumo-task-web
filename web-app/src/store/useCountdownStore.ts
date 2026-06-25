import { create } from "zustand";
import { countdownApi, buildCountdownUpdateBody } from "@/api/client";
import type { CountdownColor, CountdownEvent, CountdownRepeat } from "@/types/task";
import { toast } from "@/store/useToastStore";
import { t } from "@/i18n/useT";
import { clientId, withOfflineQueue } from "@/lib/writeQueue";

/** POST /countdowns wire body — shared by online create + offline replay. */
function countdownCreateBody(input: Omit<CountdownEvent, "id" | "createdAt">, id: string) {
  return {
    id,
    title: input.title,
    date: input.date,
    emoji: input.emoji ?? null,
    color: input.color,
    repeat: input.repeat,
    note: input.note ?? null,
  };
}

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
  load: (userId: string) => Promise<void>;
  clear: () => void;
  create: (userId: string, input: {
    title: string;
    date: string;
    emoji?: string;
    color: CountdownColor;
    repeat: CountdownRepeat;
    note?: string;
  }) => Promise<CountdownEvent>;
  update: (userId: string, id: string, patch: Partial<Omit<CountdownEvent, "id" | "createdAt">>) => Promise<void>;
  remove: (userId: string, id: string) => Promise<void>;
}

export const useCountdownStore = create<CountdownState>((set) => ({
  events: [],

  async load(userId) {
    if (userId === "local") { set({ events: [] }); return; }

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
          set({ events: localEvents });
          toast.error(t("countdown.error.load"));
          return;
        }
      }
      set({ events });
    } catch (e) {
      toast.error(t("countdown.error.load"), e instanceof Error ? e.message : String(e));
    }
  },

  clear() {
    set({ events: [] });
  },

  async create(userId, input) {
    const id = clientId("cd");
    try {
      return await withOfflineQueue(
        userId,
        { key: `create:${id}`, method: "POST", path: "/countdowns", body: countdownCreateBody(input, id) },
        async () => {
          const event = await countdownApi.create(userId, input, id);
          set((s) => ({ events: [...s.events, event] }));
          return event;
        },
        () => {
          const optimistic = { ...input, id, createdAt: new Date().toISOString() } as CountdownEvent;
          set((s) => ({ events: [...s.events, optimistic] }));
          return optimistic;
        },
      );
    } catch (e) {
      toast.error(t("countdown.error.create"), e instanceof Error ? e.message : String(e));
      throw e;
    }
  },

  async update(userId, id, patch) {
    try {
      await withOfflineQueue(
        userId,
        { key: `update:${id}:${clientId("u")}`, method: "PATCH", path: `/countdowns/${id}`, body: buildCountdownUpdateBody(patch) },
        async () => {
          const updated = await countdownApi.update(userId, id, patch);
          set((s) => ({ events: s.events.map((e) => (e.id === id ? updated : e)) }));
        },
        () => {
          set((s) => ({ events: s.events.map((e) => (e.id === id ? ({ ...e, ...patch } as CountdownEvent) : e)) }));
        },
      );
    } catch (e) {
      toast.error(t("countdown.error.update"), e instanceof Error ? e.message : String(e));
    }
  },

  async remove(userId, id) {
    try {
      await withOfflineQueue(
        userId,
        { key: `delete:${id}`, method: "DELETE", path: `/countdowns/${id}` },
        async () => {
          await countdownApi.delete(userId, id);
          set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
        },
        () => {
          set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
        },
      );
      toast.success(t("countdown.deleted"));
    } catch (e) {
      toast.error(t("countdown.error.delete"), e instanceof Error ? e.message : String(e));
    }
  },
}));
