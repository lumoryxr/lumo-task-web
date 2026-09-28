import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TestRouter } from "@/test/TestRouter";
import { CommandPalette } from "../CommandPalette";
import type { Task } from "@/types/task";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockTasks: Task[] = [
  {
    id: "1",
    title: { en: "Write proposal", zh: "撰写提案" },
    quadrant: "Q1",
    today: true,
    week_focus: false,
    due: "Fri",
    duration: 60,
    pomos_done: 0,
    pomos_total: 2,
    completed: false,
  },
  {
    id: "2",
    title: { en: "Review budget", zh: "审查预算" },
    quadrant: "Q2",
    today: false,
    week_focus: false,
    due: null,
    duration: 30,
    pomos_done: 0,
    pomos_total: 1,
    completed: false,
  },
  {
    id: "3",
    title: { en: "Done task", zh: "已完成任务" },
    quadrant: "Q1",
    today: false,
    week_focus: false,
    due: null,
    duration: 20,
    pomos_done: 1,
    pomos_total: 1,
    completed: true,
  },
];

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: any) => sel({ tasks: mockTasks }),
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: any) => sel({ locale: "en" }),
}));

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
  useLocaleString: () => (ls: { en: string; zh?: string }) => ls.en,
}));

vi.mock("@/store/usePeopleStore", () => ({
  usePeopleStore: (sel: any) => sel({ people: [] }),
}));

vi.mock("@/components/TaskEditModal", () => ({
  TaskEditModal: ({ task, onClose }: { task: Task; onClose: () => void }) => (
    <div data-testid="task-edit-modal">
      <span>{task.title.en}</span>
      <button onClick={onClose}>close-edit</button>
    </div>
  ),
}));

vi.mock("@/components/QuickCreate", () => ({
  QuickCreate: ({
    initialTitle,
    onClose,
  }: {
    initialTitle?: string;
    onClose: () => void;
    onCreated: () => void;
  }) => (
    <div data-testid="quick-create">
      <span data-testid="initial-title">{initialTitle}</span>
      <button onClick={onClose}>close-create</button>
    </div>
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup(open = true) {
  const onClose = vi.fn();
  render(
    <TestRouter>
      <CommandPalette open={open} onClose={onClose} />
    </TestRouter>,
  );
  return { onClose };
}

async function flushDebounce() {
  await act(async () => {
    vi.runAllTimers();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when closed", () => {
    setup(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the search dialog when open", () => {
    setup();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByPlaceholderText("search.placeholder")).toBeTruthy();
  });

  it("shows quick-access results when query is empty (today tasks first)", async () => {
    setup();
    await flushDebounce();
    expect(screen.getByText("search.quickAccess")).toBeTruthy();
    expect(screen.getByText("Write proposal")).toBeTruthy();
  });

  it("excludes completed tasks from results by default", async () => {
    setup();
    await flushDebounce();
    expect(screen.queryByText("Done task")).toBeNull();
  });

  it("includes completed tasks when toggle is active", async () => {
    setup();
    // Enable the "show completed" toggle
    const toggle = screen.getByRole("button", { name: "search.showCompleted" });
    fireEvent.click(toggle);
    fireEvent.change(screen.getByPlaceholderText("search.placeholder"), {
      target: { value: "done" },
    });
    await flushDebounce();
    expect(screen.getByRole("dialog").textContent).toContain("Done task");
  });

  it("filters by query after debounce", async () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("search.placeholder"), {
      target: { value: "budget" },
    });
    await flushDebounce();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Review budget");
    expect(dialog.textContent).not.toContain("Write proposal");
  });

  it("shows no-results message when nothing matches", async () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("search.placeholder"), {
      target: { value: "xyznonexistent" },
    });
    await flushDebounce();
    expect(screen.getByText("search.noResults")).toBeTruthy();
  });

  it("shows create task button with query when no results", async () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("search.placeholder"), {
      target: { value: "xyznonexistent" },
    });
    await flushDebounce();
    expect(screen.getByText(/search\.createWithQuery/)).toBeTruthy();
  });

  it("opens QuickCreate with pre-filled title when create button clicked", async () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("search.placeholder"), {
      target: { value: "new task idea" },
    });
    await flushDebounce();
    const createBtn = screen.getByText(/search\.createWithQuery/);
    fireEvent.click(createBtn);
    expect(screen.getByTestId("quick-create")).toBeTruthy();
    expect(screen.getByTestId("initial-title").textContent).toBe("new task idea");
  });

  it("calls onClose when Escape is pressed in the input", () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByPlaceholderText("search.placeholder"), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("opens TaskEditModal when Enter is pressed on the selected result", async () => {
    setup();
    await flushDebounce();
    fireEvent.keyDown(screen.getByPlaceholderText("search.placeholder"), {
      key: "Enter",
    });
    expect(screen.getByTestId("task-edit-modal")).toBeTruthy();
  });

  it("opens TaskEditModal when a result is clicked", async () => {
    setup();
    await flushDebounce();
    const buttons = screen.getAllByRole("button");
    const resultBtn = buttons.find((b) => b.textContent?.includes("Write proposal"))!;
    fireEvent.click(resultBtn);
    expect(screen.getByTestId("task-edit-modal")).toBeTruthy();
  });

  it("calls onClose when TaskEditModal closes", async () => {
    const { onClose } = setup();
    await flushDebounce();
    const buttons = screen.getAllByRole("button");
    const resultBtn = buttons.find((b) => b.textContent?.includes("Write proposal"))!;
    fireEvent.click(resultBtn);
    fireEvent.click(screen.getByText("close-edit"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("task-edit-modal")).toBeNull();
  });

  it("calls onClose when backdrop is clicked", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows Today badge on tasks with today: true", async () => {
    setup();
    await flushDebounce();
    expect(screen.getByText("search.today")).toBeTruthy();
  });

  it("matches en title on query (write → Write proposal)", async () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("search.placeholder"), {
      target: { value: "write" },
    });
    await flushDebounce();
    expect(screen.getByRole("dialog").textContent).toContain("Write proposal");
  });
});
