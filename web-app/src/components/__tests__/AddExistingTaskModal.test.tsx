import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddExistingTaskModal } from "../AddExistingTaskModal";

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
  pickLocale: (v: { en?: string } | undefined) => v?.en ?? "",
}));
vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: (s: { locale: string }) => unknown) => sel({ locale: "en" }),
}));
vi.mock("@/components/TaskTitle", () => ({
  TaskTitle: ({ text }: { text: string }) => <span>{text}</span>,
}));

const updateMock = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tasksState: any[] = [];
vi.mock("@/store/useTasksStore", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useTasksStore: (sel: (s: any) => unknown) => sel({ tasks: tasksState, update: updateMock }),
}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let projectsState: any[] = [];
vi.mock("@/store/useProjectsStore", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useProjectsStore: (sel: (s: any) => unknown) => sel({ projects: projectsState }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mkTask = (id: string, over: Record<string, any> = {}) => ({
  id, title: { en: id }, completed: false, project_id: null, ...over,
});

describe("AddExistingTaskModal", () => {
  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockResolvedValue(undefined);
    projectsState = [{ id: "p1", name: "Alpha" }, { id: "p2", name: "Beta" }];
  });

  it("lists active tasks not in this project, excluding in-project and completed", () => {
    tasksState = [
      mkTask("t1"),                        // unassigned -> candidate
      mkTask("t2", { project_id: "p2" }),  // other project -> candidate
      mkTask("t3", { project_id: "p1" }),  // already here -> excluded
      mkTask("t4", { completed: true }),   // completed -> excluded
    ];
    render(<AddExistingTaskModal projectId="p1" onClose={vi.fn()} />);
    expect(screen.getByText("t1")).toBeInTheDocument();
    expect(screen.getByText("t2")).toBeInTheDocument();
    expect(screen.queryByText("t3")).not.toBeInTheDocument();
    expect(screen.queryByText("t4")).not.toBeInTheDocument();
  });

  it("shows the source project name, or the unassigned label", () => {
    tasksState = [mkTask("t1"), mkTask("t2", { project_id: "p2" })];
    render(<AddExistingTaskModal projectId="p1" onClose={vi.fn()} />);
    expect(screen.getByText("project.tasks.unassigned")).toBeInTheDocument(); // t1
    expect(screen.getByText("Beta")).toBeInTheDocument();                     // t2
  });

  it("filters candidates by the search query", () => {
    tasksState = [mkTask("apple"), mkTask("banana")];
    render(<AddExistingTaskModal projectId="p1" onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("search.placeholder"), { target: { value: "app" } });
    expect(screen.getByText("apple")).toBeInTheDocument();
    expect(screen.queryByText("banana")).not.toBeInTheDocument();
  });

  it("assigns a picked task to the project via update(project_id)", () => {
    tasksState = [mkTask("t1")];
    render(<AddExistingTaskModal projectId="p1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("project.tasks.addExisting: t1"));
    expect(updateMock).toHaveBeenCalledWith("t1", { project_id: "p1" });
  });

  it("shows an empty state when there are no candidates", () => {
    tasksState = [mkTask("t3", { project_id: "p1" })];
    render(<AddExistingTaskModal projectId="p1" onClose={vi.fn()} />);
    expect(screen.getByText("project.tasks.addExisting.empty")).toBeInTheDocument();
  });
});
