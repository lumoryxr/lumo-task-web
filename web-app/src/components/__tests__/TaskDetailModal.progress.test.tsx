import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TaskDetailModal } from "../TaskDetailModal";
import type { Task } from "@/types/task";

const mockUpdate = vi.fn();
const mockSetSubtaskAssignee = vi.fn();
let mockTasks: Task[] = [];

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: any) =>
    sel({
      tasks: mockTasks,
      update: mockUpdate,
      complete: vi.fn(),
      addSubtask: vi.fn(),
      toggleSubtask: vi.fn(),
      deleteSubtask: vi.fn(),
      breakdownSubtasks: vi.fn(),
      setSubtaskAssignee: mockSetSubtaskAssignee,
    }),
}));

let mockProjects: any[] = [];
vi.mock("@/store/useProjectsStore", () => ({
  useProjectsStore: (sel: any) => sel({ projects: mockProjects }),
}));

const PEOPLE = [
  { id: "p_ann", name: "Ann Lee", initials: "AL", color: "var(--accent-primary)" },
  { id: "p_bo", name: "Bo Wu", initials: "BW", color: "var(--accent-primary)" },
];
vi.mock("@/store/usePeopleStore", () => ({
  usePeopleStore: (sel: any) =>
    sel({ people: PEOPLE, byId: (id: string) => PEOPLE.find((p) => p.id === id) }),
}));

vi.mock("@/store/useAppStore", () => {
  const useAppStore: any = (sel: any) => sel({ locale: "en" });
  useAppStore.getState = () => ({ locale: "en" });
  return { useAppStore };
});

const TASK: Task = {
  id: "t1",
  title: { en: "Write report" },
  quadrant: "Q2",
  today: true,
  week_focus: false,
  due: null,
  duration: 30,
  pomos_done: 0,
  pomos_total: 0,
  completed: false,
  progress: 20,
  subtasks: [
    { id: "s1", title: "Outline", completed: true },
    { id: "s2", title: "Draft", completed: true },
    { id: "s3", title: "Review", completed: false },
    { id: "s4", title: "Send", completed: false },
  ],
};

function setup(task = TASK) {
  mockTasks = [task];
  render(
    <MemoryRouter>
      <TaskDetailModal task={task} onClose={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("TaskDetailModal · progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
  });

  it("shows the task's current progress", () => {
    setup();
    expect(screen.getByRole("slider", { name: "Progress" })).toHaveValue("20");
  });

  it("saves a preset in one click", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Set progress to 75%" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("t1", { progress: 75 }));
  });

  it("saves the slider value when it is released", async () => {
    setup();
    const slider = screen.getByRole("slider", { name: "Progress" });
    fireEvent.change(slider, { target: { value: "60" } });
    expect(mockUpdate).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("t1", { progress: 60 }));
  });

  it("does not save when the value did not change", () => {
    setup();
    fireEvent.pointerUp(screen.getByRole("slider", { name: "Progress" }));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("can match the subtask completion", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Match subtasks (50%)" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("t1", { progress: 50 }));
  });

  it("disables the editor while saving and reverts the draft if the save fails", async () => {
    let reject!: (e: Error) => void;
    mockUpdate.mockReturnValue(new Promise((_, r) => { reject = r; }));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Set progress to 100%" }));
    expect(await screen.findByText("Saving…")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Progress" })).toBeDisabled();
    reject(new Error("offline"));
    await waitFor(() => expect(screen.getByRole("slider", { name: "Progress" })).toHaveValue("20"));
    expect(screen.getByRole("slider", { name: "Progress" })).not.toBeDisabled();
  });
});

describe("TaskDetailModal · stage", () => {
  const STAGES = [{ id: "plan", name: "Plan" }, { id: "build", name: "Build" }, { id: "ship", name: "Ship" }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
    mockProjects = [{ id: "p1", name: "Launch", sections: [], stages: STAGES }];
  });

  it("shows the project's full stage track with the task's current stage", () => {
    setup({ ...TASK, project_id: "p1", stage_id: "build" });
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Build");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("moves the task to the stage that is clicked", async () => {
    setup({ ...TASK, project_id: "p1", stage_id: "plan" });
    fireEvent.click(screen.getByRole("button", { name: "Set stage to Ship" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("t1", { stage_id: "ship" }));
  });

  it("can clear the stage", async () => {
    setup({ ...TASK, project_id: "p1", stage_id: "plan" });
    fireEvent.click(screen.getByRole("button", { name: "Clear stage" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("t1", { stage_id: null }));
  });

  it("hides the stage track when the task's project has no stages", () => {
    mockProjects = [{ id: "p1", name: "Launch", sections: [], stages: [] }];
    setup({ ...TASK, project_id: "p1" });
    expect(screen.queryByRole("listitem", { current: "step" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Set stage to/ })).toBeNull();
  });
});

describe("TaskDetailModal · subtask assignee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetSubtaskAssignee.mockResolvedValue(undefined);
    mockProjects = [];
  });

  const withAssignee = {
    ...TASK,
    subtasks: [
      { id: "s1", title: "Outline", completed: true, assignee_id: "p_ann" },
      { id: "s2", title: "Draft", completed: false },
    ],
  };

  it("shows who owns each subtask", () => {
    setup(withAssignee);
    expect(screen.getByRole("button", { name: "Assignee for Outline: Ann Lee" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign Draft" })).toBeInTheDocument();
  });

  it("assigns a person to a subtask from the picker", async () => {
    setup(withAssignee);
    fireEvent.click(screen.getByRole("button", { name: "Assign Draft" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Bo Wu" }));
    await waitFor(() => expect(mockSetSubtaskAssignee).toHaveBeenCalledWith("t1", "s2", "p_bo"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("can unassign a subtask", async () => {
    setup(withAssignee);
    fireEvent.click(screen.getByRole("button", { name: "Assignee for Outline: Ann Lee" }));
    expect(screen.getByRole("menuitemradio", { name: "Ann Lee" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Unassigned" }));
    await waitFor(() => expect(mockSetSubtaskAssignee).toHaveBeenCalledWith("t1", "s1", null));
  });
});

describe("TaskDetailModal · assignees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjects = [];
  });

  it("shows the primary assignee on its own line, and the others below", () => {
    setup({ ...TASK, assignee_ids: ["p_bo", "p_ann"] });
    const owner = screen.getByTestId("assignee-primary");
    expect(owner).toHaveTextContent("Owner");
    expect(owner).toHaveTextContent("Bo Wu");
    expect(owner).not.toHaveTextContent("Ann Lee");
    const others = screen.getByTestId("assignee-others");
    expect(others).toHaveTextContent("Also assigned");
    expect(others).toHaveTextContent("Ann Lee");
  });

  it("has no others line when only the primary is assigned", () => {
    setup({ ...TASK, assignee_ids: ["p_ann"] });
    expect(screen.getByTestId("assignee-primary")).toHaveTextContent("Ann Lee");
    expect(screen.queryByTestId("assignee-others")).toBeNull();
  });
});
