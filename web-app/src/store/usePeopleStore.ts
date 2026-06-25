import { create } from "zustand";
import { api } from "@/api/client";
import type { Person } from "@/types/task";
import { toast } from "@/store/useToastStore";
import { t } from "@/i18n/useT";
import { clientId, withOfflineQueue } from "@/lib/writeQueue";
import { useAuthStore } from "@/store/useAuthStore";

interface PeopleState {
  people: Person[];
  loading: boolean;
  // selectors
  byId: (id: string) => Person | undefined;
  // actions
  load: () => Promise<void>;
  clear: () => void;
  create: (input: Omit<Person, "id">) => Promise<Person>;
  update: (id: string, patch: Partial<Omit<Person, "id">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const usePeopleStore = create<PeopleState>((set, get) => ({
  people: [],
  loading: false,

  byId: (id) => get().people.find((p) => p.id === id),

  async load() {
    set({ loading: true });
    try {
      const people = await api.listPeople();
      set({ people, loading: false });
    } catch (e) {
      set({ loading: false });
      toast.error(t("error.person.load"), e instanceof Error ? e.message : String(e));
    }
  },

  clear() {
    set({ people: [], loading: false });
  },

  async create(input) {
    const id = clientId("p");
    const uid = useAuthStore.getState().user.id;
    try {
      return await withOfflineQueue(
        uid,
        { key: `create:${id}`, method: "POST", path: "/people", body: { ...input, id } },
        async () => {
          const person = await api.createPerson(input, id);
          set({ people: [...get().people, person] });
          return person;
        },
        () => {
          const optimistic = { ...input, id } as Person;
          set({ people: [...get().people, optimistic] });
          return optimistic;
        },
      );
    } catch (e) {
      toast.error(t("error.person.create"), e instanceof Error ? e.message : String(e));
      throw e;
    }
  },

  async update(id, patch) {
    const uid = useAuthStore.getState().user.id;
    try {
      await withOfflineQueue(
        uid,
        { key: `update:${id}:${Date.now()}`, method: "PATCH", path: `/people/${id}`, body: patch },
        async () => {
          const next = await api.updatePerson(id, patch);
          set({ people: get().people.map((p) => (p.id === id ? next : p)) });
        },
        () => {
          set({ people: get().people.map((p) => (p.id === id ? ({ ...p, ...patch } as Person) : p)) });
        },
      );
    } catch (e) {
      toast.error(t("error.person.update"), e instanceof Error ? e.message : String(e));
      throw e;
    }
  },

  async remove(id) {
    const uid = useAuthStore.getState().user.id;
    try {
      await withOfflineQueue(
        uid,
        { key: `delete:${id}`, method: "DELETE", path: `/people/${id}` },
        async () => {
          await api.deletePerson(id);
          set({ people: get().people.filter((p) => p.id !== id) });
        },
        () => {
          set({ people: get().people.filter((p) => p.id !== id) });
        },
      );
    } catch (e) {
      toast.error(t("error.person.delete"), e instanceof Error ? e.message : String(e));
      throw e;
    }
  },
}));
