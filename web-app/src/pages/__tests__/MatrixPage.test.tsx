import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MatrixPage } from "../MatrixPage";

// Shared spy for the Shell-provided Quick Create opener.
const { openQuickCreate } = vi.hoisted(() => ({ openQuickCreate: vi.fn() }));
vi.mock("@/components/shellOutletContext", () => ({
  useShellOutlet: () => ({ openQuickCreate }),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────
//
// useT is mocked to echo the key, so a rendered translation key proves the
// component routes its copy through i18n rather than hardcoding a literal.

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
  useLocaleString: () => (s: unknown) => String(s),
}));

vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

// Empty stores → every quadrant + the unclassified strip render their empty state.
vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (selector: (s: any) => unknown) =>
    selector({ tasks: [], byQuadrant: () => [], update: vi.fn() }),
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (selector: (s: any) => unknown) =>
    selector({ matrixView: "matrix", setMatrixView: vi.fn(), locale: "en" }),
}));

vi.mock("@/store/usePeopleStore", () => ({
  usePeopleStore: (selector: (s: any) => unknown) =>
    selector({ people: [], byId: () => undefined }),
}));

// Child modals/views are irrelevant to the empty-state copy; stub them out.
vi.mock("@/components/AIClassifyModal", () => ({ AIClassifyModal: () => null }));
vi.mock("@/components/TaskDetailModal", () => ({ TaskDetailModal: () => null }));
vi.mock("@/components/TaskEditModal", () => ({ TaskEditModal: () => null }));
vi.mock("@/components/TaskMoreMenu", () => ({ TaskMoreMenu: () => null }));
vi.mock("@/components/CalendarView", () => ({ CalendarView: () => null }));
vi.mock("@/components/PersonAvatar", () => ({ PersonAvatar: () => null }));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MatrixPage empty state", () => {
  it("renders the i18n'd empty-state copy in each empty quadrant", () => {
    render(<MatrixPage />);
    // One per quadrant (Q1–Q4) when no tasks are present.
    expect(screen.getAllByText("matrix.empty")).toHaveLength(4);
  });

  it("never renders the previously hardcoded English placeholder", () => {
    render(<MatrixPage />);
    expect(screen.queryByText("No tasks here.")).toBeNull();
    expect(screen.queryByText("Drop here")).toBeNull();
  });

  it("routes each quadrant subtitle through i18n", () => {
    render(<MatrixPage />);
    for (const key of ["matrix.q1.sub", "matrix.q2.sub", "matrix.q3.sub", "matrix.q4.sub"]) {
      expect(screen.getByText(key)).toBeTruthy();
    }
  });

  it("never renders the previously hardcoded quadrant subtitles", () => {
    render(<MatrixPage />);
    expect(screen.queryByText("Urgent · Important")).toBeNull();
    expect(screen.queryByText("Important · Not urgent")).toBeNull();
    expect(screen.queryByText("Urgent · Not important")).toBeNull();
    expect(screen.queryByText("Neither")).toBeNull();
  });
});

describe("MatrixPage create-task affordances", () => {
  beforeEach(() => openQuickCreate.mockClear());

  it("shows an explicit primary New task button that opens Quick Create", () => {
    render(<MatrixPage />);
    const btn = screen.getByRole("button", { name: "action.newTask" });
    fireEvent.click(btn);
    expect(openQuickCreate).toHaveBeenCalledTimes(1);
    // No quadrant preset when created from the toolbar.
    expect(openQuickCreate).toHaveBeenCalledWith();
  });

  it("shows a per-quadrant add button that presets that quadrant", () => {
    render(<MatrixPage />);
    const adds = screen.getAllByLabelText("matrix.quadrantAdd");
    expect(adds).toHaveLength(4);
    fireEvent.click(adds[0]);
    expect(openQuickCreate).toHaveBeenCalledWith("Q1");
  });
});
