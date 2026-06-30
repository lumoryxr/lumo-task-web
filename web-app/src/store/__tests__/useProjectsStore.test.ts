import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Project } from "@/types/task";

function mk(id: string, over: Partial<Project> = {}): Project {
  return {
    id, name: id, color: "green", goals: [], status: "active",
    createdAt: "2026-06-30T00:00:00.000Z", updatedAt: "2026-06-30T00:00:00.000Z", ...over,
  };
}

const { list, create, update, del, listAllCompleted } = vi.hoisted(() => ({
  list: vi.fn(async (): Promise<Project[]> => []),
  create: vi.fn(async (input: any, id?: string): Promise<Project> => ({
    id: id ?? "prj_new", name: input.name, color: input.color, emoji: input.emoji,
    category: input.category, goals: input.goals ?? [], content: input.content,
    status: input.status ?? "active", createdAt: "c", updatedAt: "c",
  })),
  update: vi.fn(async (id: string, patch: any): Promise<Project> => ({ ...mk(id), ...patch })),
  del: vi.fn(async () => {}),
  listAllCompleted: vi.fn(async (): Promise<any[]> => []),
}));

vi.mock("@/api/client", () => ({ projectApi: { list, create, update, delete: del }, api: { listAllCompleted } }));
vi.mock("@/store/useToastStore", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/i18n/useT", () => ({ t: (k: string) => k }));

import { useProjectsStore } from "@/store/useProjectsStore";
import { toast } from "@/store/useToastStore";

beforeEach(() => {
  vi.clearAllMocks();
  useProjectsStore.setState({ projects: [], loaded: false, doneCounts: {} });
});

describe("useProjectsStore", () => {
  it("load populates projects and sets loaded", async () => {
    list.mockResolvedValueOnce([mk("a"), mk("b")]);
    await useProjectsStore.getState().load();
    expect(useProjectsStore.getState().projects.map((p) => p.id)).toEqual(["a", "b"]);
    expect(useProjectsStore.getState().loaded).toBe(true);
  });

  it("load surfaces a toast on failure", async () => {
    list.mockRejectedValueOnce(new Error("boom"));
    await useProjectsStore.getState().load();
    expect(toast.error).toHaveBeenCalled();
    expect(useProjectsStore.getState().loaded).toBe(false);
  });

  it("create appends the returned project", async () => {
    const p = await useProjectsStore.getState().create({ name: "New", color: "cyan", goals: [], status: "active" });
    expect(p.name).toBe("New");
    expect(useProjectsStore.getState().projects).toHaveLength(1);
    expect(create).toHaveBeenCalled();
  });

  it("update replaces the project in place", async () => {
    useProjectsStore.setState({ projects: [mk("a", { name: "old" })] });
    await useProjectsStore.getState().update("a", { name: "fresh" });
    expect(useProjectsStore.getState().projects[0].name).toBe("fresh");
  });

  it("remove drops the project and toasts success", async () => {
    useProjectsStore.setState({ projects: [mk("a"), mk("b")] });
    await useProjectsStore.getState().remove("a");
    expect(useProjectsStore.getState().projects.map((p) => p.id)).toEqual(["b"]);
    expect(toast.success).toHaveBeenCalled();
  });

  it("byId resolves a project or undefined for null/missing", () => {
    useProjectsStore.setState({ projects: [mk("a")] });
    const s = useProjectsStore.getState();
    expect(s.byId("a")?.id).toBe("a");
    expect(s.byId(null)).toBeUndefined();
    expect(s.byId("nope")).toBeUndefined();
  });

  it("loadProgress aggregates completed counts per project (#223)", async () => {
    listAllCompleted.mockResolvedValueOnce([
      { id: "c1", projectId: "a" }, { id: "c2", projectId: "a" },
      { id: "c3", projectId: "b" }, { id: "c4", projectId: null }, { id: "c5" },
    ]);
    await useProjectsStore.getState().loadProgress();
    expect(useProjectsStore.getState().doneCounts).toEqual({ a: 2, b: 1 });
  });

  it("loadProgress swallows errors and leaves doneCounts untouched (best-effort)", async () => {
    useProjectsStore.setState({ doneCounts: { a: 5 } });
    listAllCompleted.mockRejectedValueOnce(new Error("net"));
    await useProjectsStore.getState().loadProgress();
    expect(useProjectsStore.getState().doneCounts).toEqual({ a: 5 });
  });

  it("clear resets doneCounts", () => {
    useProjectsStore.setState({ projects: [mk("a")], doneCounts: { a: 3 } });
    useProjectsStore.getState().clear();
    expect(useProjectsStore.getState().doneCounts).toEqual({});
  });

  it("update keeps state and toasts on API failure (no throw)", async () => {
    useProjectsStore.setState({ projects: [mk("a", { name: "keep" })] });
    update.mockRejectedValueOnce(new Error("nope"));
    await useProjectsStore.getState().update("a", { name: "x" });
    expect(useProjectsStore.getState().projects[0].name).toBe("keep");
    expect(toast.error).toHaveBeenCalled();
  });
});
