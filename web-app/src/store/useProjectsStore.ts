/**
 * Projects store (#211) — backed by the real project REST API.
 *
 * Mirrors useCountdownStore's shape (load/create/update/remove) but without the
 * one-time localStorage→server migration: projects are a new entity with no
 * legacy client-only data to import.
 */
import { create } from "zustand";
import { projectApi, type ProjectCreateInput, type ProjectUpdateInput } from "@/api/client";
import type { Project } from "@/types/task";
import { toast } from "@/store/useToastStore";
import { t } from "@/i18n/useT";
import { clientId } from "@/lib/id";

interface ProjectsState {
  projects: Project[];
  loaded: boolean;
  byId: (id: string | null | undefined) => Project | undefined;
  load: () => Promise<void>;
  clear: () => void;
  create: (input: ProjectCreateInput) => Promise<Project>;
  update: (id: string, patch: ProjectUpdateInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  loaded: false,

  byId: (id) => (id ? get().projects.find((p) => p.id === id) : undefined),

  async load() {
    try {
      const projects = await projectApi.list();
      set({ projects, loaded: true });
    } catch (e) {
      toast.error(t("project.error.load"), e instanceof Error ? e.message : String(e));
    }
  },

  clear() {
    set({ projects: [], loaded: false });
  },

  async create(input) {
    const id = clientId("prj");
    try {
      const project = await projectApi.create(input, id);
      set((s) => ({ projects: [...s.projects, project] }));
      return project;
    } catch (e) {
      toast.error(t("project.error.create"), e instanceof Error ? e.message : String(e));
      throw e;
    }
  },

  async update(id, patch) {
    try {
      const updated = await projectApi.update(id, patch);
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? updated : p)) }));
    } catch (e) {
      toast.error(t("project.error.update"), e instanceof Error ? e.message : String(e));
    }
  },

  async remove(id) {
    try {
      await projectApi.delete(id);
      set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
      toast.success(t("project.deleted"));
    } catch (e) {
      toast.error(t("project.error.delete"), e instanceof Error ? e.message : String(e));
    }
  },
}));
