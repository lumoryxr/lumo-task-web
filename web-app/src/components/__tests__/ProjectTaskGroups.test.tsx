import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ProjectTaskGroups } from "../ProjectTaskGroups";
import { DND_MIME } from "@/lib/taskDnd";
import type { Project, Task } from "@/types/task";

const mockProjectUpdate = vi.fn();
const mockTaskUpdate = vi.fn();

vi.mock("@/store/useProjectsStore", () => ({
  useProjectsStore: (sel: any) => sel({ update: mockProjectUpdate }),
}));
vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: any) => sel({ update: mockTaskUpdate }),
}));
vi.mock("@/store/useAppStore", () => {
  const useAppStore: any = (sel: any) => sel({ locale: "en" });
  useAppStore.getState = () => ({ locale: "en" });
  return { useAppStore };
});
// TaskRow pulls in half the app; a title stub is enough to see where tasks land.
vi.mock("@/components/TaskRow", () => ({
  TaskRow: ({ task }: { task: Task }) => <div data-testid="task">{task.title.en}</div>,
}));

const task = (id: string, section_id: string | null): Task => ({
  id, title: { en: id }, quadrant: "Q2", today: false, week_focus: false, due: null,
  duration: 0, pomos_done: 0, pomos_total: 0, completed: false, project_id: "p1", section_id,
});

const baseProject: Project = {
  id: "p1", name: "Launch", color: "green", goals: [], status: "active", pinned: false,
  createdAt: "", updatedAt: "",
  sections: [{ id: "s_design", name: "Design" }, { id: "s_build", name: "Build" }],
};

function setup(project = baseProject, tasks = [task("t-design", "s_design"), task("t-build", "s_build"), task("t-loose", null)]) {
  const onAddTask = vi.fn();
  render(<ProjectTaskGroups project={project} tasks={tasks} onAddTask={onAddTask} />);
  return { onAddTask };
}

const group = (name: string) => screen.getByRole("region", { name });

function dropOn(el: HTMLElement, taskId: string) {
  const dataTransfer = { types: [DND_MIME], getData: () => taskId, dropEffect: "" };
  fireEvent.dragOver(el, { dataTransfer });
  fireEvent.drop(el, { dataTransfer });
}

describe("ProjectTaskGroups", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders each group in order with its tasks and count, plus an Ungrouped bucket", () => {
    setup();
    const names = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(names).toEqual(["Ungrouped", "Design", "Build"]);
    expect(within(group("Design")).getByText("t-design")).toBeInTheDocument();
    expect(within(group("Build")).getByText("t-build")).toBeInTheDocument();
    expect(within(group("Ungrouped")).getByText("t-loose")).toBeInTheDocument();
    expect(within(group("Design")).getByText("1")).toBeInTheDocument();
  });

  it("treats a task whose group was removed as ungrouped", () => {
    setup(baseProject, [task("t-orphan", "s_gone")]);
    expect(within(group("Ungrouped")).getByText("t-orphan")).toBeInTheDocument();
  });

  it("hides the Ungrouped bucket when every task is grouped", () => {
    setup(baseProject, [task("t-design", "s_design")]);
    expect(screen.queryByRole("region", { name: "Ungrouped" })).toBeNull();
  });

  it("shows a plain list with no group headers when the project has no groups", () => {
    setup({ ...baseProject, sections: [] }, [task("a", null), task("b", null)]);
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    expect(screen.getAllByTestId("task")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "New group" })).toBeInTheDocument();
  });

  it("creates a group from the inline input", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "New group" }));
    const input = screen.getByRole("textbox", { name: "Group name" });
    fireEvent.change(input, { target: { value: "  QA  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockProjectUpdate).toHaveBeenCalledTimes(1);
    const [id, patch] = mockProjectUpdate.mock.calls[0];
    expect(id).toBe("p1");
    expect(patch.sections.slice(0, 2)).toEqual(baseProject.sections);
    expect(patch.sections[2]).toMatchObject({ name: "QA" });
    expect(patch.sections[2].id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it("does not create a group from a blank name, and Escape cancels", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "New group" }));
    const input = screen.getByRole("textbox", { name: "Group name" });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockProjectUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Group name" })).toBeNull();
  });

  it("renames a group from its menu", () => {
    setup();
    fireEvent.click(within(group("Design")).getByRole("button", { name: "Group actions: Design" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Group name" });
    fireEvent.change(input, { target: { value: "UX" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockProjectUpdate).toHaveBeenCalledWith("p1", {
      sections: [{ id: "s_design", name: "UX" }, { id: "s_build", name: "Build" }],
    });
  });

  it("reorders groups from the menu", () => {
    setup();
    fireEvent.click(within(group("Build")).getByRole("button", { name: "Group actions: Build" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move up" }));
    expect(mockProjectUpdate).toHaveBeenCalledWith("p1", {
      sections: [{ id: "s_build", name: "Build" }, { id: "s_design", name: "Design" }],
    });
  });

  it("deletes a group only after confirming, keeping its tasks", () => {
    setup();
    fireEvent.click(within(group("Design")).getByRole("button", { name: "Group actions: Design" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete group" }));
    expect(mockProjectUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockProjectUpdate).toHaveBeenCalledWith("p1", { sections: [{ id: "s_build", name: "Build" }] });
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it("collapses and expands a group", () => {
    setup();
    const toggle = within(group("Design")).getByRole("button", { name: "Design" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(group("Design")).queryByText("t-design")).toBeNull();
    fireEvent.click(toggle);
    expect(within(group("Design")).getByText("t-design")).toBeInTheDocument();
  });

  it("adds a task straight into a group", () => {
    const { onAddTask } = setup();
    fireEvent.click(within(group("Build")).getByRole("button", { name: "Add task to Build" }));
    expect(onAddTask).toHaveBeenCalledWith("s_build");
  });

  it("moves a dropped task into the target group, or out of all groups", () => {
    setup();
    dropOn(group("Build"), "t-design");
    expect(mockTaskUpdate).toHaveBeenCalledWith("t-design", { section_id: "s_build" });
    dropOn(group("Ungrouped"), "t-build");
    expect(mockTaskUpdate).toHaveBeenCalledWith("t-build", { section_id: null });
  });

  it("ignores a drop onto the group the task is already in", () => {
    setup();
    dropOn(group("Design"), "t-design");
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });

  it("hides New group once the project reaches the group limit", () => {
    const sections = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, name: `G${i}` }));
    setup({ ...baseProject, sections }, []);
    expect(screen.queryByRole("button", { name: "New group" })).toBeNull();
  });
});
