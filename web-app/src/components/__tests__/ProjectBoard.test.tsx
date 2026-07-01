import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectBoard } from "../ProjectBoard";

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
  useLocaleString: () => (s: unknown) => String(s),
}));

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (selector: (s: any) => unknown) => selector({ complete: vi.fn(), update: vi.fn() }),
}));

vi.mock("@/store/useDragSettleStore", () => ({
  useDragSettleStore: Object.assign(
    (selector: (s: any) => unknown) => selector({ settleId: null }),
    { getState: () => ({ settle: vi.fn() }) }
  ),
}));

function task(id: string, quadrant: string, title: string) {
  return { id, quadrant, title, completed: false, assignee_ids: [] };
}

describe("ProjectBoard", () => {
  it("renders four quadrant columns and places tasks in their column", () => {
    render(<ProjectBoard tasks={[task("t1", "Q1", "Alpha"), task("t2", "Q3", "Beta")] as any} />);
    for (const q of ["matrix.q1", "matrix.q2", "matrix.q3", "matrix.q4"]) {
      expect(screen.getByText(q)).toBeTruthy();
    }
    // No unclassified column when there are no unclassified tasks.
    expect(screen.queryByText("matrix.unclassified")).toBeNull();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
  });

  it("shows an unclassified column only when unclassified tasks exist", () => {
    render(<ProjectBoard tasks={[task("t1", "unclassified", "Loose")] as any} />);
    expect(screen.getByText("matrix.unclassified")).toBeTruthy();
    expect(screen.getByText("Loose")).toBeTruthy();
  });

  it("each draggable card is marked draggable for reassignment", () => {
    render(<ProjectBoard tasks={[task("t1", "Q2", "Draggable")] as any} />);
    const card = screen.getByText("Draggable").closest("[draggable]");
    expect(card).toBeTruthy();
    expect(card?.getAttribute("draggable")).toBe("true");
  });
});
