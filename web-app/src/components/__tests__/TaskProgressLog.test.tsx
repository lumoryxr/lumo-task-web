import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { TaskProgressLog } from "../TaskProgressLog";
import { toISODate } from "@/lib/format";
import type { Task } from "@/types/task";

const { addProgressNote, editProgressNote, deleteProgressNote, toastError } = vi.hoisted(() => ({
  addProgressNote: vi.fn(),
  editProgressNote: vi.fn(),
  deleteProgressNote: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ addProgressNote, editProgressNote, deleteProgressNote }),
}));
vi.mock("@/store/useToastStore", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("@/store/useAppStore", () => {
  const useAppStore = Object.assign(
    (sel: (s: { locale: "en" }) => unknown) => sel({ locale: "en" }),
    { getState: () => ({ locale: "en" as const }) },
  );
  return { useAppStore };
});

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return toISODate(d);
};
const TODAY = day(0);
const YESTERDAY = day(1);
const OLDER = day(9);

const note = (id: string, date: string, text: string, hh = "09") => ({
  id, date, text, created_at: `${date}T${hh}:00:00.000Z`,
});

const base: Task = {
  id: "t1", title: { en: "Launch" }, quadrant: "Q2", today: false, week_focus: false, due: null,
  duration: 0, pomos_done: 0, pomos_total: 0, completed: false,
};

function setup(progress_log: Task["progress_log"] = []) {
  return render(<TaskProgressLog task={{ ...base, progress_log }} />);
}

const composer = () => screen.getByRole("textbox", { name: "Progress update" });
const addBtn = () => screen.getByRole("button", { name: "Add update" });

beforeEach(() => {
  vi.clearAllMocks();
  addProgressNote.mockResolvedValue(undefined);
  editProgressNote.mockResolvedValue(undefined);
  deleteProgressNote.mockResolvedValue(undefined);
});

describe("TaskProgressLog", () => {
  it("invites a first update when there are none", () => {
    setup();
    expect(screen.getByText(/No updates yet/)).toBeInTheDocument();
  });

  it("groups updates by day, newest day first, newest update first within a day", () => {
    setup([
      note("a", OLDER, "Kick-off"),
      note("b", TODAY, "Morning: drafted outline", "08"),
      note("c", YESTERDAY, "Collected data"),
      note("d", TODAY, "Afternoon: wrote summary", "15"),
    ]);
    const days = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(days[0]).toMatch(/^Today/);
    expect(days[1]).toMatch(/^Yesterday/);
    expect(days).toHaveLength(3);
    const today = screen.getByRole("list", { name: /^Today/ });
    const items = within(today).getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("Afternoon: wrote summary");
    expect(items[1]).toContain("Morning: drafted outline");
  });

  it("adds an update for today", async () => {
    setup();
    expect(addBtn()).toBeDisabled();
    fireEvent.change(composer(), { target: { value: "Shipped the beta" } });
    fireEvent.click(addBtn());
    await waitFor(() => expect(addProgressNote).toHaveBeenCalledWith("t1", { date: TODAY, text: "Shipped the beta" }));
    await waitFor(() => expect(composer()).toHaveValue(""));
  });

  it("can log an update for an earlier day, but not a future one", async () => {
    setup();
    const date = screen.getByLabelText("Date of this update");
    expect(date).toHaveAttribute("max", TODAY);
    fireEvent.change(date, { target: { value: YESTERDAY } });
    fireEvent.change(composer(), { target: { value: "Forgot to log this" } });
    fireEvent.keyDown(composer(), { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(addProgressNote).toHaveBeenCalledWith("t1", { date: YESTERDAY, text: "Forgot to log this" }));
  });

  it("keeps the text and says so when saving fails", async () => {
    addProgressNote.mockRejectedValue(new Error("offline"));
    setup();
    fireEvent.change(composer(), { target: { value: "Important" } });
    fireEvent.click(addBtn());
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(composer()).toHaveValue("Important");
  });

  it("edits an update in place", async () => {
    setup([note("a", YESTERDAY, "Collected data")]);
    fireEvent.click(screen.getByRole("button", { name: "Edit update" }));
    const box = screen.getByRole("textbox", { name: "Edit update" });
    fireEvent.change(box, { target: { value: "Collected all the data" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(editProgressNote).toHaveBeenCalledWith("t1", "a", { date: YESTERDAY, text: "Collected all the data" }),
    );
  });

  it("cancelling an edit changes nothing", () => {
    setup([note("a", YESTERDAY, "Collected data")]);
    fireEvent.click(screen.getByRole("button", { name: "Edit update" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(editProgressNote).not.toHaveBeenCalled();
    expect(screen.getByText("Collected data")).toBeInTheDocument();
  });

  it("marks an edited update", () => {
    setup([{ ...note("a", YESTERDAY, "Collected data"), edited_at: new Date().toISOString() }]);
    expect(screen.getByText("edited")).toBeInTheDocument();
  });

  it("deletes an update only after confirming", async () => {
    setup([note("a", YESTERDAY, "Collected data")]);
    fireEvent.click(screen.getByRole("button", { name: "Delete update" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteProgressNote).toHaveBeenCalledWith("t1", "a"));
  });

  it("shows every update; the panel around it scrolls", () => {
    const many = Array.from({ length: 9 }, (_, i) => note(`n${i}`, day(i), `Update ${i}`));
    setup(many);
    expect(screen.getAllByRole("listitem")).toHaveLength(9);
  });
});
