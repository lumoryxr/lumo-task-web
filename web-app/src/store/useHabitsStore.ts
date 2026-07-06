import { create } from "zustand";
import { habitApi } from "@/api/client";
import type { Habit, HabitColor, HabitFrequency, HabitLog } from "@/types/task";
import { toast } from "@/store/useToastStore";
import { t } from "@/i18n/useT";
import { clientId } from "@/lib/id";

function migrationKey(userId: string) {
  return `lumo.habits.migrated.v1.${userId}`;
}

function readLocalHabits(userId: string): Habit[] {
  try {
    const raw = localStorage.getItem(`lumo.habits.v1.${userId}`);
    return raw ? (JSON.parse(raw) as Habit[]) : [];
  } catch {
    return [];
  }
}

function readLocalLogs(userId: string): HabitLog[] {
  try {
    const raw = localStorage.getItem(`lumo.habit-logs.v1.${userId}`);
    return raw ? (JSON.parse(raw) as HabitLog[]) : [];
  } catch {
    return [];
  }
}

interface HabitsState {
  habits: Habit[];
  logs: HabitLog[];
  /** False until the first load() attempt settles, so the page can show a
   *  skeleton instead of flashing the empty state before data arrives (#207). */
  hydrated: boolean;
  load: (userId: string) => Promise<void>;
  clear: () => void;
  create: (userId: string, input: {
    title: string;
    emoji?: string;
    color: HabitColor;
    frequency: HabitFrequency;
    note?: string;
  }) => Promise<Habit>;
  update: (userId: string, id: string, patch: Partial<Omit<Habit, "id" | "createdAt">>) => Promise<void>;
  remove: (userId: string, id: string) => Promise<void>;
  log: (userId: string, habitId: string, date: string) => Promise<void>;
  unlog: (userId: string, habitId: string, date: string) => Promise<void>;
}

export const useHabitsStore = create<HabitsState>((set) => ({
  habits: [],
  logs: [],
  hydrated: false,

  async load(userId) {
    try {
    if (userId === "local") { set({ habits: [], logs: [] }); return; }

    // One-time migration from localStorage → server
    let migrationFailed = false;
    if (!localStorage.getItem(migrationKey(userId))) {
      const oldHabits = readLocalHabits(userId);
      const oldLogs = readLocalLogs(userId);
      if (oldHabits.length === 0 && oldLogs.length === 0) {
        // Nothing to migrate — mark done, skip the round-trip
        localStorage.setItem(migrationKey(userId), "1");
      } else {
        try {
          await habitApi.migrate(userId, oldHabits, oldLogs);
          localStorage.setItem(migrationKey(userId), "1");
          localStorage.removeItem(`lumo.habits.v1.${userId}`);
          localStorage.removeItem(`lumo.habit-logs.v1.${userId}`);
        } catch {
          // Keep localStorage data intact — will retry on next load
          migrationFailed = true;
        }
      }
    }

    try {
      const [habits, logs] = await Promise.all([
        habitApi.listHabits(userId),
        habitApi.listLogs(userId),
      ]);
      // If migration never persisted and the server has nothing yet, show the
      // un-migrated local data rather than a misleading empty list (never
      // silently drop the user's data from the UI).
      if (migrationFailed && habits.length === 0 && logs.length === 0) {
        const localHabits = readLocalHabits(userId);
        const localLogs = readLocalLogs(userId);
        if (localHabits.length > 0 || localLogs.length > 0) {
          set({ habits: localHabits, logs: localLogs });
          toast.error(t("habit.error.load"));
          return;
        }
      }
      set({ habits, logs });
    } catch (e) {
      toast.error(t("habit.error.load"), e instanceof Error ? e.message : String(e));
    }
    } finally {
      // Mark hydrated on every exit path (local shortcut, migration-fallback
      // return, success, or error) so the skeleton yields to real content once.
      set({ hydrated: true });
    }
  },

  clear() {
    set({ habits: [], logs: [], hydrated: false });
  },

  async create(userId, input) {
    const id = clientId("habit");
    try {
      const habit = await habitApi.createHabit(userId, input, id);
      set((s) => ({ habits: [...s.habits, habit] }));
      return habit;
    } catch (e) {
      toast.error(t("habit.error.create"), e instanceof Error ? e.message : String(e));
      throw e;
    }
  },

  async update(userId, id, patch) {
    try {
      const updated = await habitApi.updateHabit(userId, id, patch);
      set((s) => ({ habits: s.habits.map((h) => (h.id === id ? updated : h)) }));
    } catch (e) {
      toast.error(t("habit.error.update"), e instanceof Error ? e.message : String(e));
      // Re-throw (like create) so the edit form stays open for retry instead of
      // closing as though the save succeeded.
      throw e;
    }
  },

  async remove(userId, id) {
    try {
      await habitApi.deleteHabit(userId, id);
      set((s) => ({
        habits: s.habits.filter((h) => h.id !== id),
        logs: s.logs.filter((l) => l.habitId !== id),
      }));
      toast.success(t("habit.deleted"));
    } catch (e) {
      toast.error(t("habit.error.delete"), e instanceof Error ? e.message : String(e));
    }
  },

  async log(userId, habitId, date) {
    try {
      const entry = await habitApi.logHabit(userId, habitId, date);
      set((s) => {
        const already = s.logs.some((l) => l.habitId === habitId && l.date === date);
        return already ? s : { logs: [...s.logs, entry] };
      });
    } catch (e) {
      toast.error(t("habit.error.log"), e instanceof Error ? e.message : String(e));
      throw e;
    }
  },

  async unlog(userId, habitId, date) {
    try {
      await habitApi.unlogHabit(userId, habitId, date);
      set((s) => ({ logs: s.logs.filter((l) => !(l.habitId === habitId && l.date === date)) }));
    } catch (e) {
      toast.error(t("habit.error.log"), e instanceof Error ? e.message : String(e));
      throw e;
    }
  },
}));
