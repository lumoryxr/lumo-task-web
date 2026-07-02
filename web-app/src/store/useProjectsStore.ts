/**
 * Projects store (#211) — backed by the real project REST API.
 *
 * Mirrors useCountdownStore's shape (load/create/update/remove) but without the
 * one-time localStorage→server migration: projects are a new entity with no
 * legacy client-only data to import.
 */
import { create } from "zustand";
import { api, projectApi, type ProjectCreateInput, type ProjectUpdateInput } from "@/api/client";
import type { Project } from "@/types/task";
import { toast } from "@/store/useToastStore";
import { t } from "@/i18n/useT";
import { clientId } from "@/lib/id";
import { useTasksStore } from "@/store/useTasksStore";

interface ProjectsState {
  projects: Project[];
  loaded: boolean;
  /** Completed-task count per project_id (#223), for the real done/total ring. */
  doneCounts: Record<string, number>;
  /** Completed focus minutes per project_id (#211 V2 ⭐5), for project recaps. */
  focusMinutes: Record<string, number>;
  byId: (id: string | null | undefined) => Project | undefined;
  load: () => Promise<void>;
  /** Fetch all completed entries once and aggregate per-project done + focus. */
  loadProgress: () => Promise<void>;
  clear: () => void;
  create: (input: ProjectCreateInput) => Promise<Project>;
  update: (id: string, patch: ProjectUpdateInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  loaded: false,
  doneCounts: {},
  focusMinutes: {},

  byId: (id) => (id ? get().projects.find((p) => p.id === id) : undefined),

  async load() {
    try {
      const projects = await projectApi.list();
      set({ projects, loaded: true });
    } catch (e) {
      toast.error(t("project.error.load"), e instanceof Error ? e.message : String(e));
    }
  },

  async loadProgress() {
    try {
      const entries = await api.listAllCompleted();
      const counts: Record<string, number> = {};
      const minutes: Record<string, number> = {};
      for (const e of entries) {
        if (e.projectId) {
          counts[e.projectId] = (counts[e.projectId] ?? 0) + 1;
          minutes[e.projectId] = (minutes[e.projectId] ?? 0) + (e.duration ?? 0);
        }
      }
      set({ doneCounts: counts, focusMinutes: minutes });
    } catch {
      // Progress ring is best-effort; on failure cards fall back to 0 done.
    }
  },

  clear() {
    set({ projects: [], loaded: false, doneCounts: {}, focusMinutes: {} });
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
      // The server cascades the delete to this project's tasks; refresh the
      // task cache so they vanish from Matrix/Today right away instead of
      // lingering until the next sync/reload.
      await useTasksStore.getState().load();
      toast.success(t("project.deleted"));
    } catch (e) {
      toast.error(t("project.error.delete"), e instanceof Error ? e.message : String(e));
    }
  },
}));
