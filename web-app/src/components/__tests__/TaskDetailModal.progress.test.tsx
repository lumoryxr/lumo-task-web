import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TaskDetailModal } from "../TaskDetailModal";
import type { Task } from "@/types/task";

const mockUpdate = vi.fn();
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
    }),
}));

vi.mock("@/store/usePeopleStore", () => ({
  usePeopleStore: (sel: any) => sel({ people: [], byId: () => undefined }),
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
