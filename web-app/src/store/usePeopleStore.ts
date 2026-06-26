import { create } from "zustand";
import { api } from "@/api/client";
import type { Person } from "@/types/task";
import { toast } from "@/store/useToastStore";
import { t } from "@/i18n/useT";
import { clientId } from "@/lib/id";

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
    try {
      const person = await api.createPerson(input, id);
      set({ people: [...get().people, person] });
      return person;
    } catch (e) {
      toast.error(t("error.person.create"), e instanceof Error ? e.message : String(e));
      throw e;
    }
  },

  async update(id, patch) {
    try {
      const next = await api.updatePerson(id, patch);
      set({ people: get().people.map((p) => (p.id === id ? next : p)) });
    } catch (e) {
      toast.error(t("error.person.update"), e instanceof Error ? e.message : String(e));
      throw e;
    }
  },

  async remove(id) {
    try {
      await api.deletePerson(id);
      set({ people: get().people.filter((p) => p.id !== id) });
    } catch (e) {
      toast.error(t("error.person.delete"), e instanceof Error ? e.message : String(e));
      throw e;
    }
  },
}));
