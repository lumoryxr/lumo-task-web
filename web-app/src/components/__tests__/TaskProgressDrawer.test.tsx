import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskProgressDrawer } from "../TaskProgressDrawer";
import type { Task } from "@/types/task";

const { addProgressNote } = vi.hoisted(() => ({ addProgressNote: vi.fn() }));

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ addProgressNote, editProgressNote: vi.fn(), deleteProgressNote: vi.fn() }),
}));
vi.mock("@/store/useAppStore", () => {
  const useAppStore = Object.assign(
    (sel: (s: { locale: "en" }) => unknown) => sel({ locale: "en" }),
    { getState: () => ({ locale: "en" as const }) },
  );
  return { useAppStore };
});

const task: Task = {
  id: "t1", title: { en: "Launch site" }, quadrant: "Q2", today: false, week_focus: false, due: null,
  duration: 0, pomos_done: 0, pomos_total: 0, completed: false,
  progress_log: Array.from({ length: 9 }, (_, i) => ({
    id: `n${i}`, date: `2026-11-${String(10 + i).padStart(2, "0")}`, text: `Update ${i}`, created_at: `2026-11-${String(10 + i).padStart(2, "0")}T09:00:00.000Z`,
  })),
};

beforeEach(() => vi.clearAllMocks());

describe("TaskProgressDrawer", () => {
  it("is its own panel: titled, names the task, and puts the cursor in the composer", () => {
    render(<TaskProgressDrawer task={task} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Progress log" });
    expect(dialog).toHaveClass("task-drawer");
    expect(dialog).toHaveTextContent("Launch site");
    expect(screen.getByRole("textbox", { name: "Progress update" })).toHaveFocus();
  });

  it("shows every update (the panel scrolls; nothing is folded away)", () => {
    render(<TaskProgressDrawer task={task} onClose={vi.fn()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(9);
    expect(screen.queryByRole("button", { name: /earlier/ })).toBeNull();
  });

  it("closes from its X, and from Escape when nothing is being typed", () => {
    const onClose = vi.fn();
    render(<TaskProgressDrawer task={task} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps a half-written update: Escape doesn't close it", () => {
    const onClose = vi.fn();
    render(<TaskProgressDrawer task={task} onClose={onClose} />);
    const box = screen.getByRole("textbox", { name: "Progress update" });
    fireEvent.change(box, { target: { value: "Half written" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
