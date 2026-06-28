import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TaskRow } from "../TaskRow";
import type { Task } from "@/types/task";

// Top-level mock functions so vi.mock (hoisted) can reference them
const mockComplete = vi.fn();
const mockRemove = vi.fn();

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: any) =>
    sel({ complete: mockComplete, remove: mockRemove }),
}));

vi.mock("@/store/usePeopleStore", () => ({
  usePeopleStore: (sel: any) => sel({ people: [], byId: () => undefined }),
}));

// Mutable so individual tests can flip reduced-motion (name must start with
// "mock" to satisfy vi.mock hoisting rules).
const mockAppState = { reducedMotion: true };
vi.mock("@/store/useAppStore", () => {
  const useAppStore: any = (sel: any) =>
    sel({ locale: "en", reducedMotion: mockAppState.reducedMotion });
  useAppStore.getState = () => ({ reducedMotion: mockAppState.reducedMotion });
  return { useAppStore };
});

const TASK: Task = {
  id: "t_test1",
  title: { en: "Test task", zh: "测试任务" },
  quadrant: "Q1",
  today: true,
  week_focus: false,
  due: null,
  duration: 30,
  pomos_done: 0,
  pomos_total: 2,
  completed: false,
};

function renderRow(task = TASK) {
  return render(
    <MemoryRouter>
      <TaskRow task={task} />
    </MemoryRouter>
  );
}

describe("TaskRow", () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockComplete.mockResolvedValue(undefined);
    mockAppState.reducedMotion = true; // default: instant, deterministic
  });

  it("renders the task title", () => {
    renderRow();
    expect(screen.getByText("Test task")).toBeInTheDocument();
  });

  it("complete button is present with accessible label", () => {
    renderRow();
    expect(screen.getByRole("button", { name: /complete/i })).toBeInTheDocument();
  });

  it("shows recurrence icon when task has a recurrence rule", () => {
    renderRow({ ...TASK, recurrence: "weekly" });
    expect(screen.getByLabelText(/weekly/i)).toBeInTheDocument();
  });

  it("does not show recurrence icon when recurrence is none", () => {
    renderRow({ ...TASK, recurrence: "none" });
    expect(screen.queryByLabelText(/daily|weekdays|weekly|monthly/i)).not.toBeInTheDocument();
  });

  it("does not show recurrence icon when recurrence is absent", () => {
    renderRow({ ...TASK });
    expect(screen.queryByLabelText(/daily|weekdays|weekly|monthly/i)).not.toBeInTheDocument();
  });

  it("complete button becomes disabled while request is in-flight", async () => {
    // Arrange: complete resolves after a tick
    let resolveComplete!: () => void;
    mockComplete.mockReturnValueOnce(
      new Promise<void>((res) => { resolveComplete = res; })
    );

    renderRow();
    const btn = screen.getByRole("button", { name: /complete/i });
    expect(btn).not.toBeDisabled();

    // Act: click
    fireEvent.click(btn);

    // Assert: disabled while in flight
    await waitFor(() => expect(btn).toBeDisabled());

    // Resolve and confirm it re-enables
    resolveComplete();
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("under reduced motion, completes immediately with no dwell", async () => {
    mockAppState.reducedMotion = true;
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: /complete/i }));
    // No timer advance needed — the dwell is skipped.
    await waitFor(() => expect(mockComplete).toHaveBeenCalledWith("t_test1"));
  });

  it("with motion enabled, shows the pop then dwells before completing", async () => {
    vi.useFakeTimers();
    try {
      mockAppState.reducedMotion = false;
      renderRow();
      const btn = screen.getByRole("button", { name: /complete/i });
      fireEvent.click(btn);

      // The confirmation pop is applied right away…
      expect(btn.className).toContain("task-complete-circle--done");
      // …and a checkmark is rendered (the circle is filled).
      expect(btn.querySelector("svg")).toBeTruthy();
      // …but the actual completion is deferred until the dwell elapses.
      expect(mockComplete).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(240);
      expect(mockComplete).toHaveBeenCalledWith("t_test1");
    } finally {
      vi.useRealTimers();
    }
  });
});
