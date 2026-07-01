import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MatrixPage } from "../MatrixPage";

// Project filter bar on the Matrix view (#211 V2 ⭐2). Mirrors Today's filter:
// a chip per project referenced by active tasks, filtering the quadrants.

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
  useLocaleString: () => (s: unknown) => String(s),
}));

vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

function task(id: string, quadrant: string, project_id: string, title: string) {
  return {
    id,
    title,
    quadrant,
    project_id,
    completed: false,
    duration: 0,
    pomos_total: 0,
    pomos_done: 0,
    assignee_ids: [],
    tags: [],
  };
}

const TASKS = [
  task("t1", "Q1", "p1", "Alpha-Q1"),
  task("t2", "Q2", "p2", "Beta-Q2"),
];

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (selector: (s: any) => unknown) =>
    selector({
      tasks: TASKS,
      byQuadrant: (q: string) => TASKS.filter((t) => t.quadrant === q && !t.completed),
      loading: false,
      update: vi.fn(),
      complete: vi.fn(),
      remove: vi.fn(),
      duplicate: vi.fn(),
    }),
}));

vi.mock("@/store/useProjectsStore", () => ({
  useProjectsStore: (selector: (s: any) => unknown) =>
    selector({
      projects: [
        { id: "p1", name: "Alpha" },
        { id: "p2", name: "Beta" },
      ],
    }),
}));

vi.mock("@/store/useTemplatesStore", () => ({
  useTemplatesStore: (selector: (s: any) => unknown) => selector({ saveFromTask: vi.fn() }),
}));

vi.mock("@/store/useDragSettleStore", () => ({
  useDragSettleStore: Object.assign(
    (selector: (s: any) => unknown) => selector({ settleId: null, settle: vi.fn() }),
    { getState: () => ({ settle: vi.fn() }) }
  ),
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (selector: (s: any) => unknown) =>
    selector({ matrixView: "matrix", setMatrixView: vi.fn(), locale: "en" }),
}));

vi.mock("@/store/usePeopleStore", () => ({
  usePeopleStore: (selector: (s: any) => unknown) => selector({ byId: () => undefined }),
}));

vi.mock("@/components/AIClassifyModal", () => ({ AIClassifyModal: () => null }));
vi.mock("@/components/TemplateLibraryModal", () => ({ TemplateLibraryModal: () => null }));
vi.mock("@/components/TaskDetailModal", () => ({ TaskDetailModal: () => null }));
vi.mock("@/components/TaskEditModal", () => ({ TaskEditModal: () => null }));
vi.mock("@/components/TaskMoreMenu", () => ({ TaskMoreMenu: () => null }));
vi.mock("@/components/CalendarView", () => ({ CalendarView: () => null }));
vi.mock("@/components/PersonAvatar", () => ({ PersonAvatar: () => null }));

describe("MatrixPage project filter", () => {
  it("renders an All + per-project chip when active tasks span projects", () => {
    render(<MatrixPage />);
    expect(screen.getByText("project.filter.all")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    // Both tasks visible before any filter.
    expect(screen.getByText("Alpha-Q1")).toBeTruthy();
    expect(screen.getByText("Beta-Q2")).toBeTruthy();
  });

  it("filters quadrant cards to the selected project", () => {
    render(<MatrixPage />);
    fireEvent.click(screen.getByText("Beta"));
    // Only the Beta project's task remains across the board.
    expect(screen.queryByText("Alpha-Q1")).toBeNull();
    expect(screen.getByText("Beta-Q2")).toBeTruthy();
  });

  it("clears the filter when the active chip is toggled off", () => {
    render(<MatrixPage />);
    const beta = screen.getByText("Beta");
    fireEvent.click(beta);
    expect(screen.queryByText("Alpha-Q1")).toBeNull();
    fireEvent.click(beta);
    expect(screen.getByText("Alpha-Q1")).toBeTruthy();
  });
});
