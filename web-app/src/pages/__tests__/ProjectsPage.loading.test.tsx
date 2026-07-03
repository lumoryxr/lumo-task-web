import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectsPage } from "../ProjectsPage";

// Regression for the flashing empty-state on first paint (mirrors the habits
// fix #285): while projects are still loading and nothing is cached, the page
// must show a loading skeleton — not the "no projects yet" empty state.

type Project = { id: string; name: string; color: string; status: string; goals: never[]; category: null };

const state: { projects: Project[]; loaded: boolean } = { projects: [], loaded: false };

vi.mock("@/store/useProjectsStore", () => ({
  useProjectsStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      projects: state.projects,
      loaded: state.loaded,
      remove: vi.fn(),
      doneCounts: {},
      focusMinutes: {},
      loadProgress: vi.fn(),
    }),
}));

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ tasks: [] }),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

vi.mock("@/i18n/useT", () => ({ useT: () => (k: string) => k }));

function mk(id: string, name: string): Project {
  return { id, name, color: "green", status: "active", goals: [], category: null };
}

beforeEach(() => {
  state.projects = [];
  state.loaded = false;
});

describe("ProjectsPage initial load", () => {
  it("shows a loading skeleton (not the empty state) while loading with nothing cached", () => {
    state.loaded = false;
    state.projects = [];
    const { container } = render(<ProjectsPage />);
    // Skeleton shimmer bars are present…
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    // …and the empty-state copy is NOT flashed.
    expect(screen.queryByText("project.empty.title")).toBeNull();
  });

  it("shows the empty state (no skeleton) once loaded with zero projects", () => {
    state.loaded = true;
    state.projects = [];
    const { container } = render(<ProjectsPage />);
    expect(container.querySelectorAll(".skeleton").length).toBe(0);
    expect(screen.getByText("project.empty.title")).toBeTruthy();
  });

  it("renders the project grid (no skeleton) once loaded with projects", () => {
    state.loaded = true;
    state.projects = [mk("p1", "Launch")];
    const { container } = render(<ProjectsPage />);
    expect(container.querySelectorAll(".skeleton").length).toBe(0);
    expect(screen.getByText("Launch")).toBeTruthy();
  });
});
