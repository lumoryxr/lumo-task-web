import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MatrixPage } from "../MatrixPage";

// Tag filter bar on the Matrix view (Tags V2). Mirrors Today's tag filter and
// the Matrix project filter: a chip per tag carried by active tasks, filtering
// the quadrants conjunctively with the project filter.

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
  useLocaleString: () => (s: unknown) => String(s),
}));

vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

function task(id: string, quadrant: string, tags: string[], title: string) {
  return {
    id,
    title,
    quadrant,
    project_id: null,
    completed: false,
    duration: 0,
    pomos_total: 0,
    pomos_done: 0,
    assignee_ids: [],
    tags,
  };
}

const TASKS = [
  task("t1", "Q1", ["work"], "Work-Q1"),
  task("t2", "Q2", ["home"], "Home-Q2"),
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
  useProjectsStore: (selector: (s: any) => unknown) => selector({ projects: [] }),
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

describe("MatrixPage tag filter", () => {
  it("renders an All + per-tag chip when active tasks carry tags", () => {
    render(<MatrixPage />);
    expect(screen.getByText("tag.filter.all")).toBeTruthy();
    expect(screen.getByText("work")).toBeTruthy();
    expect(screen.getByText("home")).toBeTruthy();
    expect(screen.getByText("Work-Q1")).toBeTruthy();
    expect(screen.getByText("Home-Q2")).toBeTruthy();
  });

  it("filters quadrant cards to the selected tag", () => {
    render(<MatrixPage />);
    fireEvent.click(screen.getByText("home"));
    expect(screen.queryByText("Work-Q1")).toBeNull();
    expect(screen.getByText("Home-Q2")).toBeTruthy();
  });

  it("clears the filter when the active chip is toggled off", () => {
    render(<MatrixPage />);
    const home = screen.getByText("home");
    fireEvent.click(home);
    expect(screen.queryByText("Work-Q1")).toBeNull();
    fireEvent.click(home);
    expect(screen.getByText("Work-Q1")).toBeTruthy();
  });
});
