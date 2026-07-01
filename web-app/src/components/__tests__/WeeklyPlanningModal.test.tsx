import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WeeklyPlanningModal, isWeeklyPlanned, getWeeklyPlanningDoneKey } from "../WeeklyPlanningModal";
import type { Task } from "@/types/task";

// ─── Mocks ────────────────────────────────────────────────────────────────

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
  useLocaleString: () => (val: { en: string } | string) =>
    typeof val === "string" ? val : (val?.en ?? ""),
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: (s: { locale: string }) => unknown) =>
    sel({ locale: "en" }),
}));

const mockUpdate = vi.fn().mockResolvedValue(undefined);

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: (s: unknown) => unknown) =>
    sel({
      tasks: TASKS,
      update: mockUpdate,
    }),
}));

vi.mock("@/lib/format", () => ({
  toISODate: (d: Date) => d.toISOString().slice(0, 10),
}));

// Render createPortal inline for test environment
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    createPortal: (node: unknown) => node,
  };
});

// ─── Test data ────────────────────────────────────────────────────────────

function makeTask(override: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: { en: "Task 1" },
    quadrant: "Q1",
    today: false,
    week_focus: false,
    completed: false,
    duration: 30,
    pomos_done: 0,
    pomos_total: 1,
    due: null,
    ...override,
  };
}

// Module-level mutable task list
let TASKS: Task[] = [];

const defaultStats = { tasksCompleted: 5, focusMinutes: 45 };

beforeEach(() => {
  TASKS = [];
  mockUpdate.mockClear();

  const store: Record<string, string> = {};
  vi.spyOn(Storage.prototype, "getItem").mockImplementation((k) => store[k] ?? null);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation((k, v) => { store[k] = v; });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helper: render modal with defaults ──────────────────────────────────

function renderModal(props: Partial<React.ComponentProps<typeof WeeklyPlanningModal>> = {}) {
  return render(
    <WeeklyPlanningModal
      onClose={vi.fn()}
      prevWeekStats={defaultStats}
      prevWeekFocusTasks={[]}
      {...props}
    />
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("WeeklyPlanningModal", () => {
  // ── Step navigation ─────────────────────────────────────────────────────

  it("starts on the review step", () => {
    renderModal();
    expect(screen.getByText("weekly.step.review.title")).toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "qc.close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("clicking backdrop calls onClose", () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    // The dialog backdrop is the role="dialog" element itself
    const backdrop = screen.getByRole("dialog");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("advances from review to select step on Next", () => {
    renderModal();
    fireEvent.click(screen.getByText("planning.btn.next"));
    expect(screen.getByText("weekly.step.select.title")).toBeInTheDocument();
  });

  it("advances from select to done step on Next", () => {
    renderModal();
    fireEvent.click(screen.getByText("planning.btn.next")); // review → select
    fireEvent.click(screen.getByText("planning.btn.next")); // select → done
    expect(screen.getByText("weekly.step.done.title")).toBeInTheDocument();
  });

  it("Back button returns from select to review", () => {
    renderModal();
    fireEvent.click(screen.getByText("planning.btn.next")); // review → select
    expect(screen.getByText("weekly.step.select.title")).toBeInTheDocument();
    fireEvent.click(screen.getByText("planning.btn.back"));
    expect(screen.getByText("weekly.step.review.title")).toBeInTheDocument();
  });

  it("shows step progress label", () => {
    renderModal();
    expect(screen.getByText("weekly.progress")).toBeInTheDocument();
  });

  // ── Review step ──────────────────────────────────────────────────────────

  it("displays prev week stats on review step", () => {
    renderModal({ prevWeekStats: { tasksCompleted: 12, focusMinutes: 90 } });
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
  });

  it("shows prev week focus tasks on review step", () => {
    const prevTasks = [makeTask({ id: "pf1", title: { en: "Focus Task A" }, week_focus: true })];
    renderModal({ prevWeekFocusTasks: prevTasks });
    expect(screen.getByText("Focus Task A")).toBeInTheDocument();
  });

  // ── Select step ──────────────────────────────────────────────────────────

  it("only shows Q1 and Q2 tasks in select step", () => {
    TASKS = [
      makeTask({ id: "t1", title: { en: "Q1 Task" }, quadrant: "Q1" }),
      makeTask({ id: "t2", title: { en: "Q2 Task" }, quadrant: "Q2" }),
      makeTask({ id: "t3", title: { en: "Q3 Task" }, quadrant: "Q3" }),
    ];
    renderModal();
    fireEvent.click(screen.getByText("planning.btn.next")); // → select
    expect(screen.getByText("Q1 Task")).toBeInTheDocument();
    expect(screen.getByText("Q2 Task")).toBeInTheDocument();
    expect(screen.queryByText("Q3 Task")).not.toBeInTheDocument();
  });

  it("shows empty state when no Q1/Q2 tasks", () => {
    TASKS = [];
    renderModal();
    fireEvent.click(screen.getByText("planning.btn.next")); // → select
    expect(screen.getByText("weekly.step.select.empty")).toBeInTheDocument();
  });

  it("pre-selects existing week_focus tasks", () => {
    TASKS = [
      makeTask({ id: "t1", title: { en: "Already Focus" }, quadrant: "Q1", week_focus: true }),
      makeTask({ id: "t2", title: { en: "Not Focus" }, quadrant: "Q1", week_focus: false }),
    ];
    renderModal();
    fireEvent.click(screen.getByText("planning.btn.next")); // → select
    // count badge should show 1 selected
    expect(screen.getByText("weekly.selected")).toBeInTheDocument();
  });

  it("shows soft-limit hint when >3 tasks are selected", async () => {
    TASKS = [
      makeTask({ id: "t1", title: { en: "Task A" }, quadrant: "Q1" }),
      makeTask({ id: "t2", title: { en: "Task B" }, quadrant: "Q1" }),
      makeTask({ id: "t3", title: { en: "Task C" }, quadrant: "Q1" }),
      makeTask({ id: "t4", title: { en: "Task D" }, quadrant: "Q2" }),
    ];
    const user = userEvent.setup();
    renderModal();
    fireEvent.click(screen.getByText("planning.btn.next")); // → select

    await user.click(screen.getByText("Task A"));
    await user.click(screen.getByText("Task B"));
    await user.click(screen.getByText("Task C"));
    await user.click(screen.getByText("Task D")); // 4th → triggers hint
    expect(screen.getByText("weekly.step.select.limit")).toBeInTheDocument();
  });

  it("clears soft-limit hint when a task is deselected back to ≤3", async () => {
    TASKS = [
      makeTask({ id: "t1", title: { en: "Task A" }, quadrant: "Q1" }),
      makeTask({ id: "t2", title: { en: "Task B" }, quadrant: "Q1" }),
      makeTask({ id: "t3", title: { en: "Task C" }, quadrant: "Q1" }),
      makeTask({ id: "t4", title: { en: "Task D" }, quadrant: "Q2" }),
    ];
    const user = userEvent.setup();
    renderModal();
    fireEvent.click(screen.getByText("planning.btn.next")); // → select

    await user.click(screen.getByText("Task A"));
    await user.click(screen.getByText("Task B"));
    await user.click(screen.getByText("Task C"));
    await user.click(screen.getByText("Task D")); // 4th → hint
    await user.click(screen.getByText("Task D")); // deselect → back to 3
    expect(screen.queryByText("weekly.step.select.limit")).not.toBeInTheDocument();
  });

  // ── Done step ────────────────────────────────────────────────────────────

  it("shows selected tasks on done step with star icon", async () => {
    TASKS = [makeTask({ id: "t1", title: { en: "Alpha Task" }, quadrant: "Q1" })];
    const user = userEvent.setup();
    renderModal();
    fireEvent.click(screen.getByText("planning.btn.next")); // → select
    await user.click(screen.getByText("Alpha Task"));
    fireEvent.click(screen.getByText("planning.btn.next")); // → done
    expect(screen.getByText("weekly.step.done.title")).toBeInTheDocument();
    expect(screen.getByText("Alpha Task")).toBeInTheDocument();
    expect(screen.getByText("★")).toBeInTheDocument();
  });

  // ── Finish / API calls ───────────────────────────────────────────────────

  it("calls update(id, {week_focus:true}) for newly selected tasks on finish", async () => {
    TASKS = [makeTask({ id: "t1", title: { en: "Task 1" }, quadrant: "Q1", week_focus: false })];
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderModal({ onClose });

    fireEvent.click(screen.getByText("planning.btn.next")); // → select
    await user.click(screen.getByText("Task 1"));
    fireEvent.click(screen.getByText("planning.btn.next")); // → done
    fireEvent.click(screen.getByText("weekly.btn.finish"));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mockUpdate).toHaveBeenCalledWith("t1", { week_focus: true });
  });

  it("calls update(id, {week_focus:false}) for deselected tasks on finish", async () => {
    TASKS = [makeTask({ id: "t1", title: { en: "Task 1" }, quadrant: "Q1", week_focus: true })];
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByText("planning.btn.next")); // → select
    // t1 is pre-selected; click to deselect it
    fireEvent.click(screen.getByText("Task 1"));
    fireEvent.click(screen.getByText("planning.btn.next")); // → done
    fireEvent.click(screen.getByText("weekly.btn.finish"));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mockUpdate).toHaveBeenCalledWith("t1", { week_focus: false });
  });

  it("writes weekly_planning_done_week to localStorage on finish", async () => {
    TASKS = [];
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByText("planning.btn.next")); // → select
    fireEvent.click(screen.getByText("planning.btn.next")); // → done
    fireEvent.click(screen.getByText("weekly.btn.finish"));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "lumo.weekly_planning_done_week",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    );
  });

  it("does not call update for already-week_focus tasks that stay selected", async () => {
    TASKS = [makeTask({ id: "t1", title: { en: "Task 1" }, quadrant: "Q1", week_focus: true })];
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByText("planning.btn.next")); // → select (t1 pre-selected)
    fireEvent.click(screen.getByText("planning.btn.next")); // → done
    fireEvent.click(screen.getByText("weekly.btn.finish"));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    // t1 is already week_focus=true and still selected → no update needed
    expect(mockUpdate).not.toHaveBeenCalledWith("t1", expect.anything());
  });

  // ── isWeeklyPlanned helper ───────────────────────────────────────────────

  describe("isWeeklyPlanned()", () => {
    it("returns false when localStorage key is absent", () => {
      expect(isWeeklyPlanned()).toBe(false);
    });

    it("returns true when localStorage holds this week's Monday ISO date", () => {
      const today = new Date();
      // compute monday
      const d = new Date(today);
      d.setHours(0, 0, 0, 0);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      const weekKey = d.toISOString().slice(0, 10);
      localStorage.setItem(getWeeklyPlanningDoneKey(), weekKey);
      expect(isWeeklyPlanned()).toBe(true);
    });

    it("returns false when localStorage holds a different week key", () => {
      localStorage.setItem(getWeeklyPlanningDoneKey(), "2020-01-06");
      expect(isWeeklyPlanned()).toBe(false);
    });
  });
});
