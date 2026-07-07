import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ProjectDetailPage } from "../ProjectDetailPage";

// Detail-page polish (#246 follow-up): explicit ✓ confirm on the name field,
// double-confirm on archive, and a display ↔ edit toggle for notes.

const mockUpdate = vi.fn();
const mockRemove = vi.fn();

const project = {
  id: "p1",
  name: "Launch",
  category: "Work",
  emoji: "🚀",
  color: "green",
  status: "active",
  goals: [] as Array<Record<string, unknown>>,
  content: undefined as string | undefined,
};

// Mutable so individual tests can exercise the cold-load / not-found branches.
let projectsState: Array<typeof project> = [project];
let loadedState = true;

vi.mock("@/store/useProjectsStore", () => ({
  useProjectsStore: (sel: any) =>
    sel({
      projects: projectsState,
      loaded: loadedState,
      update: mockUpdate,
      remove: mockRemove,
      doneCounts: { p1: 2 },
      focusMinutes: { p1: 90 },
      loadProgress: vi.fn(),
    }),
}));

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: any) => sel({ tasks: [], create: vi.fn() }),
}));

vi.mock("@/store/useTemplatesStore", () => ({
  useTemplatesStore: (sel: any) => sel({ saveFromProject: vi.fn() }),
}));

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (sel: any) => sel({ user: { name: "Jalen" } }),
}));

vi.mock("@/i18n/useT", () => ({ useT: () => (key: string) => key }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: "p1" }) };
});

// TipTap doesn't render cleanly under jsdom — stub the editor with a marker.
vi.mock("@/components/ProjectContentEditor", () => ({
  ProjectContentEditor: ({ editable }: { editable?: boolean }) => (
    <div data-testid="content-editor">{editable === false ? "display" : "edit"}</div>
  ),
}));
vi.mock("@/components/TaskRow", () => ({ TaskRow: () => null }));
vi.mock("@/components/ProjectBoard", () => ({ ProjectBoard: () => null }));
vi.mock("@/components/ProjectRecapCard", () => ({ ProjectRecapCard: () => null }));

function renderPage() {
  return render(<ProjectDetailPage />);
}

describe("ProjectDetailPage polish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    project.content = undefined;
    project.goals = [];
    projectsState = [project];
    loadedState = true;
  });

  // Cold deep-link/refresh: the projects list is still loading async, so the
  // page must show a loading skeleton (not the "not found" empty state) until
  // the store reports loaded (#370, mirrors the grid fix #293).
  it("shows a loading skeleton (not the empty state) while the store is loading", () => {
    projectsState = [];
    loadedState = false;
    renderPage();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("project.empty.title")).toBeNull();
  });

  it("shows the not-found empty state once loaded and the project is absent", () => {
    projectsState = [];
    loadedState = true;
    const { container } = renderPage();
    expect(screen.getByText("project.empty.title")).toBeTruthy();
    // No skeleton bars — the empty state replaces the loading skeleton.
    expect(container.querySelectorAll(".skeleton")).toHaveLength(0);
  });

  it("shows a confirm button only after the name changes, and commits on click", () => {
    renderPage();
    const nameInput = screen.getByLabelText("project.field.name") as HTMLInputElement;
    // No confirm button initially.
    expect(screen.queryByLabelText("project.save")).toBeNull();

    fireEvent.change(nameInput, { target: { value: "Launch v2" } });
    const confirm = screen.getAllByLabelText("project.save")[0];
    expect(confirm).toBeTruthy();

    fireEvent.click(confirm);
    expect(mockUpdate).toHaveBeenCalledWith("p1", { name: "Launch v2" });
  });

  it("asks for confirmation before archiving (via ConfirmDialog)", () => {
    renderPage();
    // Opens the dialog; cancelling must not archive.
    fireEvent.click(screen.getByText("project.archive"));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByText("common.cancel"));
    expect(mockUpdate).not.toHaveBeenCalled();
    // Reopen and confirm → archives.
    fireEvent.click(screen.getByText("project.archive"));
    const dialog2 = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog2).getByText("project.archive")); // confirm button inside dialog
    expect(mockUpdate).toHaveBeenCalledWith("p1", { status: "archived" });
  });

  it("asks for confirmation before deleting a goal (via ConfirmDialog)", () => {
    project.goals = [{ text: "Ship v1", done: false }];
    renderPage();
    // Cancel path: the goal must not be removed.
    fireEvent.click(screen.getByLabelText("common.delete: Ship v1"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByText("common.cancel"));
    expect(mockUpdate).not.toHaveBeenCalled();
    // Confirm path: the goal is removed.
    fireEvent.click(screen.getByLabelText("common.delete: Ship v1"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByText("common.delete"));
    expect(mockUpdate).toHaveBeenCalledWith("p1", { goals: [] });
  });

  it("collapses notes to a preview and opens/closes the edit modal", () => {
    project.content = '{"type":"doc","content":[]}';
    renderPage();
    // Collapsed on the page: a read-only preview, no modal yet.
    expect(screen.getByTestId("content-editor").textContent).toBe("display");
    expect(screen.queryByRole("dialog")).toBeNull();

    // Header Edit button opens the modal, which renders the editable editor.
    fireEvent.click(screen.getByText("project.content.edit"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("content-editor").textContent).toBe("edit");

    // Done closes the modal; the page shows only the preview again.
    fireEvent.click(within(dialog).getByText("project.content.done"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("content-editor").textContent).toBe("display");
  });

  it("cycles a KPI goal's OKR confidence pill (unset → on_track) and persists it", () => {
    project.goals = [{ text: "Q3 sales", done: false, target: 100, current: 42 }];
    renderPage();
    const pill = screen.getByLabelText("project.goal.confidence.set: Q3 sales");
    fireEvent.click(pill);
    expect(mockUpdate).toHaveBeenCalledWith("p1", {
      goals: [{ text: "Q3 sales", done: false, target: 100, current: 42, confidence: "on_track" }],
    });
  });

  it("shows an empty-notes button with no content, and opens the modal from it", () => {
    renderPage();
    // No preview editor when empty; the empty hint is the affordance.
    expect(screen.queryByTestId("content-editor")).toBeNull();
    fireEvent.click(screen.getByText("project.content.empty"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("content-editor").textContent).toBe("edit");
  });
});
