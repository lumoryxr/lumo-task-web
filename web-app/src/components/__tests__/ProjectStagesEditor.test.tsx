import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectStagesEditor } from "../ProjectStagesEditor";
import type { Project, Task } from "@/types/task";

const mockUpdate = vi.fn();
vi.mock("@/store/useProjectsStore", () => ({
  useProjectsStore: (sel: any) => sel({ update: mockUpdate }),
}));
vi.mock("@/store/useAppStore", () => {
  const useAppStore: any = (sel: any) => sel({ locale: "en" });
  useAppStore.getState = () => ({ locale: "en" });
  return { useAppStore };
});

const STAGES = [{ id: "plan", name: "Plan" }, { id: "build", name: "Build" }, { id: "ship", name: "Ship" }];
const project = (stages = STAGES): Project => ({
  id: "p1", name: "Launch", color: "green", goals: [], status: "active", pinned: false,
  sections: [], stages, createdAt: "", updatedAt: "",
});
const task = (id: string, stage_id: string | null): Task => ({
  id, title: { en: id }, quadrant: "Q2", today: false, week_focus: false, due: null,
  duration: 0, pomos_done: 0, pomos_total: 0, completed: false, project_id: "p1", stage_id,
});

function setup(p = project(), tasks: Task[] = [task("a", "build"), task("b", "build"), task("c", null)]) {
  render(<ProjectStagesEditor project={p} tasks={tasks} />);
}

describe("ProjectStagesEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the stage track with how many tasks sit in each stage", () => {
    setup();
    expect(screen.getAllByRole("listitem").map((li) => li.getAttribute("data-state"))).toHaveLength(3);
    expect(screen.getByText("2 tasks")).toBeInTheDocument();
  });

  it("invites the user to set up stages when there are none", () => {
    setup(project([]), []);
    expect(screen.getByText(/No stages yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit stages" }));
    expect(screen.getByRole("textbox", { name: "Stage name" })).toBeInTheDocument();
  });

  it("adds a stage at the end", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit stages" }));
    const input = screen.getByRole("textbox", { name: "Stage name" });
    fireEvent.change(input, { target: { value: "  Retro " } });
    fireEvent.keyDown(input, { key: "Enter" });
    const [, patch] = mockUpdate.mock.calls[0];
    expect(patch.stages.slice(0, 3)).toEqual(STAGES);
    expect(patch.stages[3]).toMatchObject({ name: "Retro" });
    expect(patch.stages[3].id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it("renames a stage in place", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit stages" }));
    const field = screen.getByDisplayValue("Build");
    fireEvent.change(field, { target: { value: "Develop" } });
    fireEvent.blur(field);
    expect(mockUpdate).toHaveBeenCalledWith("p1", {
      stages: [STAGES[0], { id: "build", name: "Develop" }, STAGES[2]],
    });
  });

  it("does not save an unchanged or blank rename", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit stages" }));
    const field = screen.getByDisplayValue("Build");
    fireEvent.blur(field);
    fireEvent.change(field, { target: { value: "  " } });
    fireEvent.blur(field);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("reorders stages", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit stages" }));
    fireEvent.click(screen.getByRole("button", { name: "Move later: Plan" }));
    expect(mockUpdate).toHaveBeenCalledWith("p1", { stages: [STAGES[1], STAGES[0], STAGES[2]] });
  });

  it("deletes an empty stage straight away", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit stages" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete stage Ship" }));
    expect(mockUpdate).toHaveBeenCalledWith("p1", { stages: [STAGES[0], STAGES[1]] });
  });

  it("asks before deleting a stage that still has tasks", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit stages" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete stage Build" }));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByText("2 tasks in this stage will have no stage.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockUpdate).toHaveBeenCalledWith("p1", { stages: [STAGES[0], STAGES[2]] });
  });

  it("hides the add field once the stage limit is reached", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, name: `S${i}` }));
    setup(project(twelve), []);
    fireEvent.click(screen.getByRole("button", { name: "Edit stages" }));
    expect(screen.queryByRole("textbox", { name: "Stage name" })).toBeNull();
  });

  it("returns to the track view when done", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit stages" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("textbox", { name: "Stage name" })).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
