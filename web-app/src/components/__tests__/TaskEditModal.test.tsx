import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TaskEditModal } from "../TaskEditModal";
import type { Task } from "@/types/task";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUpdate = vi.fn();
const mockRemove = vi.fn();

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: any) => sel({ update: mockUpdate, remove: mockRemove, tasks: [] }),
}));

vi.mock("@/store/usePeopleStore", () => ({
  usePeopleStore: (sel: any) => sel({ people: [] }),
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: any) => sel({ locale: "en" }),
}));

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TASK: Task = {
  id: "t1",
  title: { en: "Buy groceries", zh: "买菜" },
  quadrant: "Q2",
  today: false,
  week_focus: false,
  due: null,
  duration: 30,
  pomos_done: 0,
  pomos_total: 2,
  completed: false,
};

function setup(task = TASK) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <TaskEditModal task={task} onClose={onClose} />
    </MemoryRouter>
  );
  return { onClose };
}

function getSaveBtn() {
  // Query by accessible name (aria-label), not text — while a save is in-flight
  // the label is replaced by an aria-hidden <Spinner/>, so getByText would miss it.
  return screen.getByRole("button", { name: "edit.save" });
}

function getTitleInput() {
  return screen.getByDisplayValue("Buy groceries") as HTMLInputElement;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TaskEditModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({});
    mockRemove.mockResolvedValue(undefined);
  });

  it("pre-fills the title from the task prop", () => {
    setup();
    expect(getTitleInput().value).toBe("Buy groceries");
  });

  it("disables save button when title is cleared", () => {
    setup();
    fireEvent.change(getTitleInput(), { target: { value: "" } });
    expect(getSaveBtn()).toBeDisabled();
  });

  it("disables save button while update is in-flight", async () => {
    let resolve!: () => void;
    mockUpdate.mockReturnValueOnce(new Promise<void>((res) => { resolve = res; }));

    setup();
    fireEvent.click(getSaveBtn());
    await waitFor(() => expect(getSaveBtn()).toBeDisabled());

    resolve();
    await waitFor(() => expect(getSaveBtn()).not.toBeDisabled());
  });

  it("shows a spinner and sets aria-busy on Save while the update is in-flight (#430 AC1)", async () => {
    let resolve!: () => void;
    mockUpdate.mockReturnValueOnce(new Promise<void>((res) => { resolve = res; }));

    setup();
    const save = getSaveBtn();
    // Idle: label shown, not busy.
    expect(save).toHaveAttribute("aria-busy", "false");
    expect(save.textContent).toContain("edit.save");

    fireEvent.click(save);
    // In-flight: spinner replaces the label and aria-busy flips true.
    await waitFor(() => expect(getSaveBtn()).toHaveAttribute("aria-busy", "true"));
    expect(getSaveBtn().querySelector(".spinner")).not.toBeNull();
    expect(getSaveBtn().textContent).not.toContain("edit.save");

    resolve();
    await waitFor(() => expect(getSaveBtn()).toHaveAttribute("aria-busy", "false"));
    expect(getSaveBtn().querySelector(".spinner")).toBeNull();
  });

  it("sources the delete-confirm label from the edit.deleteConfirm i18n key (#430 AC2)", () => {
    setup();
    // First click arms the confirm-to-delete state; the label must come from the
    // i18n key, not a hardcoded locale ternary.
    fireEvent.click(screen.getByText("edit.delete"));
    expect(screen.getByText("edit.deleteConfirm")).toBeInTheDocument();
    expect(screen.queryByText("确认删除？")).toBeNull();
    expect(screen.queryByText("Confirm delete?")).toBeNull();
  });

  it("calls onClose after successful save", async () => {
    const { onClose } = setup();
    fireEvent.click(getSaveBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("calls onClose when Escape is pressed", () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("pre-fills description from task.desc", () => {
    const task: Task = { ...TASK, desc: { en: "Pick up milk and eggs" } };
    setup(task);
    const textarea = screen.getByPlaceholderText("edit.desc.placeholder") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Pick up milk and eggs");
  });

  it("sends desc as LocalizedString when filled in", async () => {
    setup();
    const textarea = screen.getByPlaceholderText("edit.desc.placeholder");
    fireEvent.change(textarea, { target: { value: "Some notes" } });
    fireEvent.click(getSaveBtn());
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ desc: { en: "Some notes", zh: "Some notes" } })
      )
    );
  });

  it("defaults desc to null when unset", async () => {
    setup();
    fireEvent.click(getSaveBtn());
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ desc: null })
      )
    );
  });

  it("sends desc as null after clearing existing description", async () => {
    const task: Task = { ...TASK, desc: { en: "Old notes" } };
    setup(task);
    const textarea = screen.getByPlaceholderText("edit.desc.placeholder");
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.click(getSaveBtn());
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ desc: null })
      )
    );
  });

  it("pre-fills scheduled_start from task prop", () => {
    const task: Task = { ...TASK, scheduled_start: "2026-06-20T09:30:00" };
    setup(task);
    const input = screen.getByDisplayValue("2026-06-20T09:30") as HTMLInputElement;
    expect(input.value).toBe("2026-06-20T09:30");
  });

  it("sends scheduled_start to update when set", async () => {
    setup();
    const dtInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(dtInput, { target: { value: "2026-06-21T10:00" } });
    fireEvent.click(getSaveBtn());
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ scheduled_start: "2026-06-21T10:00" })
      )
    );
  });

  it("defaults scheduled_start to null when unset", async () => {
    setup();
    fireEvent.click(getSaveBtn());
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ scheduled_start: null })
      )
    );
  });

  it("sends scheduled_start as null after clicking Clear", async () => {
    const task: Task = { ...TASK, scheduled_start: "2026-06-20T09:30:00" };
    setup(task);
    const clearBtn = screen.getByText("edit.clearSchedule");
    fireEvent.click(clearBtn);
    fireEvent.click(getSaveBtn());
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ scheduled_start: null })
      )
    );
  });

  it("pre-fills recurrence from task prop", () => {
    const task: Task = { ...TASK, recurrence: "weekly" };
    setup(task);
    const select = screen.getByDisplayValue("task.recurrence.weekly") as HTMLSelectElement;
    expect(select.value).toBe("weekly");
  });

  it("sends recurrence to update", async () => {
    setup();
    const select = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "daily" } });
    fireEvent.click(getSaveBtn());
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ recurrence: "daily" })
      )
    );
  });

  it("sends due as null when task has no due date", async () => {
    setup();
    fireEvent.click(getSaveBtn());
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ due: null })
      )
    );
  });

  it("pre-fills ISO due date from task prop", () => {
    const task: Task = { ...TASK, due: "2026-08-15" };
    setup(task);
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput.value).toBe("2026-08-15");
  });

  it("sends the selected ISO due date on save", async () => {
    setup();
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-09-01" } });
    fireEvent.click(getSaveBtn());
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ due: "2026-09-01" })
      )
    );
  });

  it("clears due date when None button is clicked", async () => {
    const task: Task = { ...TASK, due: "2026-08-15" };
    setup(task);
    const clearBtn = screen.getByText("due.none");
    fireEvent.click(clearBtn);
    fireEvent.click(getSaveBtn());
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ due: null })
      )
    );
  });
});
