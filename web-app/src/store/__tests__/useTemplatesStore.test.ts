import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Project, Task, TaskTemplate, ProjectTemplate, TemplatePayload, ProjectTemplatePayload } from "@/types/task";

// Capture what the template API receives.
const { create, createProject, rename, del, list, taskCreate, projectCreate } = vi.hoisted(() => ({
  create: vi.fn(async (name: string, payload: TemplatePayload, id?: string): Promise<TaskTemplate> => ({
    id: id ?? "tpl_new",
    name,
    kind: "task",
    payload,
    createdAt: "2026-06-28T00:00:00.000Z",
  })),
  createProject: vi.fn(async (name: string, payload: ProjectTemplatePayload, id?: string): Promise<ProjectTemplate> => ({
    id: id ?? "tpl_prj",
    name,
    kind: "project",
    payload,
    createdAt: "2026-06-28T00:00:00.000Z",
  })),
  rename: vi.fn(async (id: string, name: string): Promise<TaskTemplate> => ({
    id, name, kind: "task", payload: { title: { en: "x" } } as TemplatePayload, createdAt: "t",
  })),
  del: vi.fn(async () => {}),
  list: vi.fn(async () => []),
  taskCreate: vi.fn(async (input: unknown): Promise<Task> => ({ id: "t_made", ...(input as object) } as Task)),
  projectCreate: vi.fn(async (input: unknown): Promise<Project> => ({ id: "prj_made", ...(input as object) } as Project)),
}));

vi.mock("@/api/client", () => ({ templateApi: { create, createProject, rename, delete: del, list } }));
vi.mock("@/store/useTasksStore", () => ({ useTasksStore: { getState: () => ({ create: taskCreate }) } }));
vi.mock("@/store/useProjectsStore", () => ({ useProjectsStore: { getState: () => ({ create: projectCreate }) } }));
vi.mock("@/store/useToastStore", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/i18n/useT", () => ({
  t: (k: string) => k,
  pickLocale: (v: { en?: string; zh?: string } | undefined, l: string) => (v ? v[l as "en"] ?? v.en ?? "" : ""),
}));
vi.mock("@/store/useAppStore", () => ({ useAppStore: { getState: () => ({ locale: "en" }) } }));

import {
  useTemplatesStore,
  payloadFromTask,
  inputFromPayload,
  projectPayloadFromProject,
} from "@/store/useTemplatesStore";

const SRC: Task = {
  id: "t_src",
  title: { en: "Weekly review", zh: "每周回顾" },
  desc: { en: "details" },
  quadrant: "Q2",
  today: true,
  week_focus: false,
  due: "2026-07-01",
  duration: 45,
  pomos_done: 3,
  pomos_total: 4,
  assignee_ids: ["p1"],
  recurrence: "weekly",
  subtasks: [
    { id: "st_1", title: "outline", completed: true },
    { id: "st_2", title: "draft", completed: false },
  ],
  scheduled_start: null,
  completed: false,
};

describe("payloadFromTask", () => {
  it("captures the task definition and drops per-instance progress", () => {
    const p = payloadFromTask(SRC);
    expect(p.title).toEqual({ en: "Weekly review", zh: "每周回顾" });
    expect(p.quadrant).toBe("Q2");
    expect(p.duration).toBe(45);
    expect(p.pomos_total).toBe(4);
    expect(p.recurrence).toBe("weekly");
    expect(p.assignee_ids).toEqual(["p1"]);
    // subtasks become titles only — no ids, no completion
    expect(p.subtasks).toEqual([{ title: "outline" }, { title: "draft" }]);
    expect((p as Record<string, unknown>).pomos_done).toBeUndefined();
  });
});

describe("inputFromPayload", () => {
  it("rebuilds a fresh task input with reset subtasks and new ids", () => {
    const payload = payloadFromTask(SRC);
    const input = inputFromPayload(payload);
    expect(input.quadrant).toBe("Q2");
    expect(input.subtasks).toHaveLength(2);
    expect(input.subtasks!.every((s) => s.completed === false)).toBe(true);
    expect(input.subtasks!.map((s) => s.title)).toEqual(["outline", "draft"]);
    expect(input.subtasks!.map((s) => s.id)).not.toContain("st_1");
    expect(input.subtasks!.every((s) => typeof s.id === "string" && s.id.length > 0)).toBe(true);
  });
});

describe("useTemplatesStore", () => {
  beforeEach(() => {
    create.mockClear();
    createProject.mockClear();
    rename.mockClear();
    del.mockClear();
    taskCreate.mockClear();
    projectCreate.mockClear();
    useTemplatesStore.setState({ templates: [] });
  });

  it("saveFromTask defaults the name to the task title and stores the template", async () => {
    const tpl = await useTemplatesStore.getState().saveFromTask(SRC);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toBe("Weekly review"); // derived name
    expect(create.mock.calls[0][1].quadrant).toBe("Q2"); // payload
    expect(tpl).toBeDefined();
    expect(useTemplatesStore.getState().templates.some((x) => x.id === tpl!.id)).toBe(true);
  });

  it("saveFromTask honours an explicit name", async () => {
    await useTemplatesStore.getState().saveFromTask(SRC, "My template");
    expect(create.mock.calls[0][0]).toBe("My template");
  });

  it("instantiate creates a task from the template payload (progress reset)", async () => {
    const tpl: TaskTemplate = {
      id: "tpl_1",
      name: "Weekly review",
      kind: "task",
      payload: payloadFromTask(SRC),
      createdAt: "t",
    };
    useTemplatesStore.setState({ templates: [tpl] });
    await useTemplatesStore.getState().instantiate("tpl_1");
    expect(taskCreate).toHaveBeenCalledTimes(1);
    const input = taskCreate.mock.calls[0][0] as { subtasks: { completed: boolean }[] };
    expect(input.subtasks.every((s) => s.completed === false)).toBe(true);
  });

  it("instantiate throws when the template is missing", async () => {
    await expect(useTemplatesStore.getState().instantiate("nope")).rejects.toThrow();
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it("remove deletes via the API and drops it from the store", async () => {
    useTemplatesStore.setState({
      templates: [{ id: "tpl_1", name: "x", kind: "task", payload: { title: { en: "x" } } as TemplatePayload, createdAt: "t" }],
    });
    await useTemplatesStore.getState().remove("tpl_1");
    expect(del).toHaveBeenCalledWith("tpl_1");
    expect(useTemplatesStore.getState().templates).toHaveLength(0);
  });

  it("rename updates the stored template", async () => {
    useTemplatesStore.setState({
      templates: [{ id: "tpl_1", name: "old", kind: "task", payload: { title: { en: "x" } } as TemplatePayload, createdAt: "t" }],
    });
    await useTemplatesStore.getState().rename("tpl_1", "new");
    expect(rename).toHaveBeenCalledWith("tpl_1", "new");
    expect(useTemplatesStore.getState().templates[0].name).toBe("new");
  });
});

const PROJECT: Project = {
  id: "prj_src",
  name: "Launch",
  category: "Work",
  color: "cyan",
  emoji: "🚀",
  goals: [
    { text: "Ship v1", done: true },
    { text: "Announce", done: false },
  ],
  content: "notes",
  status: "active",
  pinned: false,
  createdAt: "t",
  updatedAt: "t",
};

describe("projectPayloadFromProject", () => {
  it("captures project fields + tasks and resets goal completion", () => {
    const p = projectPayloadFromProject(PROJECT, [SRC]);
    expect(p.name).toBe("Launch");
    expect(p.color).toBe("cyan");
    expect(p.emoji).toBe("🚀");
    // Goals carry text only — no done flag baked in.
    expect(p.goals).toEqual([{ text: "Ship v1" }, { text: "Announce" }]);
    expect(p.tasks).toHaveLength(1);
    expect(p.tasks[0].quadrant).toBe("Q2");
    expect((p.tasks[0] as Record<string, unknown>).pomos_done).toBeUndefined();
  });
});

describe("useTemplatesStore — project templates (#211 V2 ⭐3)", () => {
  beforeEach(() => {
    create.mockClear();
    createProject.mockClear();
    taskCreate.mockClear();
    projectCreate.mockClear();
    useTemplatesStore.setState({ templates: [] });
  });

  it("saveFromProject builds a project payload and stores it", async () => {
    const tpl = await useTemplatesStore.getState().saveFromProject(PROJECT, [SRC]);
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(createProject.mock.calls[0][0]).toBe("Launch"); // name defaults to project name
    const payload = createProject.mock.calls[0][1];
    expect(payload.tasks).toHaveLength(1);
    expect(payload.goals).toEqual([{ text: "Ship v1" }, { text: "Announce" }]);
    expect(tpl?.kind).toBe("project");
    expect(useTemplatesStore.getState().templates.some((x) => x.id === tpl!.id)).toBe(true);
  });

  it("instantiateProject creates a project then files each scaffold task under it", async () => {
    const tpl: ProjectTemplate = {
      id: "tpl_prj_1",
      name: "Launch blueprint",
      kind: "project",
      payload: projectPayloadFromProject(PROJECT, [SRC]),
      createdAt: "t",
    };
    useTemplatesStore.setState({ templates: [tpl] });
    const project = await useTemplatesStore.getState().instantiateProject("tpl_prj_1");
    expect(projectCreate).toHaveBeenCalledTimes(1);
    // Goals reset to not-done on the new project.
    expect((projectCreate.mock.calls[0][0] as { goals: unknown }).goals).toEqual([
      { text: "Ship v1", done: false },
      { text: "Announce", done: false },
    ]);
    expect(taskCreate).toHaveBeenCalledTimes(1);
    expect((taskCreate.mock.calls[0][0] as { project_id: string }).project_id).toBe("prj_made");
    expect(project?.id).toBe("prj_made");
  });

  it("instantiate returns undefined (no task created) for a project template", async () => {
    useTemplatesStore.setState({
      templates: [{ id: "tpl_prj_2", name: "P", kind: "project", payload: projectPayloadFromProject(PROJECT, []), createdAt: "t" }],
    });
    const result = await useTemplatesStore.getState().instantiate("tpl_prj_2");
    expect(result).toBeUndefined();
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it("instantiateProject returns undefined for a task template", async () => {
    useTemplatesStore.setState({
      templates: [{ id: "tpl_t", name: "t", kind: "task", payload: payloadFromTask(SRC), createdAt: "t" }],
    });
    const result = await useTemplatesStore.getState().instantiateProject("tpl_t");
    expect(result).toBeUndefined();
    expect(projectCreate).not.toHaveBeenCalled();
  });
});
