import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { BatchActionBar } from "../BatchActionBar";

const completeBatch = vi.fn(async () => ({ ok: 1, failed: 0 }));
const removeBatch = vi.fn(async () => ({ ok: 1, failed: 0 }));
const moveBatch = vi.fn(async () => ({ ok: 1, failed: 0 }));
const setSelection = vi.fn();
const clearSelection = vi.fn();
const setSelectMode = vi.fn();

const state: { selectMode: boolean; selectedIds: string[] } = { selectMode: true, selectedIds: ["a", "b"] };

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: any) =>
    sel({
      selectMode: state.selectMode,
      selectedIds: state.selectedIds,
      setSelection,
      clearSelection,
      setSelectMode,
      completeBatch,
      removeBatch,
      moveBatch,
    }),
}));
vi.mock("@/i18n/useT", () => ({ useT: () => (k: string) => k }));

beforeEach(() => {
  vi.clearAllMocks();
  state.selectMode = true;
  state.selectedIds = ["a", "b"];
});

function renderBar(candidateIds = ["a", "b", "c"]) {
  return render(<BatchActionBar candidateIds={candidateIds} />);
}

describe("BatchActionBar", () => {
  it("renders nothing when not in select mode", () => {
    state.selectMode = false;
    const { container } = renderBar();
    expect(container.firstChild).toBeNull();
  });

  it("shows the selected count", () => {
    renderBar();
    expect(screen.getByText("batch.count")).toBeInTheDocument(); // {n} not interpolated by stub t
  });

  it("select all sets selection to all candidates", () => {
    renderBar(["a", "b", "c"]);
    fireEvent.click(screen.getByText("batch.selectAll"));
    expect(setSelection).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("when all candidates already selected, the toggle clears instead", () => {
    state.selectedIds = ["a", "b", "c"];
    renderBar(["a", "b", "c"]);
    fireEvent.click(screen.getByText("batch.clear"));
    expect(clearSelection).toHaveBeenCalled();
  });

  it("Complete runs completeBatch with the selection", async () => {
    renderBar();
    fireEvent.click(screen.getByText("batch.complete"));
    expect(completeBatch).toHaveBeenCalledWith(["a", "b"]);
  });

  it("Move opens a quadrant menu and moves to the picked quadrant", () => {
    renderBar();
    fireEvent.click(screen.getByText("batch.move"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Q3" }));
    expect(moveBatch).toHaveBeenCalledWith(["a", "b"], "Q3");
  });

  it("Delete confirms via dialog before removing", () => {
    renderBar();
    // Open the confirm dialog; cancelling must not delete.
    fireEvent.click(screen.getByText("batch.delete"));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByText("common.cancel"));
    expect(removeBatch).not.toHaveBeenCalled();
    // Reopen and confirm → deletes.
    fireEvent.click(screen.getByText("batch.delete"));
    const dialog2 = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog2).getByText("batch.delete")); // confirm button inside the dialog
    expect(removeBatch).toHaveBeenCalledWith(["a", "b"]);
  });

  it("Done exits select mode", () => {
    renderBar();
    fireEvent.click(screen.getByText("batch.done"));
    expect(setSelectMode).toHaveBeenCalledWith(false);
  });
});
