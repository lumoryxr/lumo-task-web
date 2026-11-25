import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
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

const mockOpenQuickCreate = vi.fn();
vi.mock("@/components/shellOutletContext", () => ({
  useShellOutlet: () => ({ openQuickCreate: mockOpenQuickCreate }),
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
  ProjectContentEditor: ({ editable, fill }: { editable?: boolean; fill?: boolean }) => (
    <div data-testid="content-editor" data-fill={fill ? "true" : "false"}>{editable === false ? "display" : "edit"}</div>
  ),
}));
vi.mock("@/components/TaskRow", () => ({ TaskRow: () => null }));
vi.mock("@/components/ProjectBoard", () => ({ ProjectBoard: () => null }));
vi.mock("@/components/ProjectRecapCard", () => ({ ProjectRecapCard: () => null }));
vi.mock("@/components/TaskHistory", () => ({
  TaskHistoryButton: ({ projectId, projectName }: { projectId?: string; projectName?: string }) => (
    <button type="button" data-project-id={projectId} data-project-name={projectName}>history.open</button>
  ),
}));

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

  it("shows the name and category as text, not as fields you can type into by accident", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Launch" })).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.queryByLabelText("project.field.name")).toBeNull();
    expect(screen.queryByLabelText("project.category.label")).toBeNull();
    expect(screen.queryByLabelText("project.field.emoji")).toBeNull();
  });

  it("edits the name, emoji, category and colour in a dialog behind an Edit button", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "project.edit" }));
    const dialog = screen.getByRole("dialog", { name: "project.edit" });
    const name = within(dialog).getByLabelText("project.field.name") as HTMLInputElement;
    expect(name.value).toBe("Launch");
    fireEvent.change(name, { target: { value: "Launch v2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "project.save" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "Launch v2" })));
  });

  it("asks for confirmation before archiving (via ConfirmDialog)", () => {
    renderPage();
    const openArchive = () => {
      fireEvent.click(screen.getByRole("button", { name: "project.more" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "project.archive" }));
    };
    // Opens the dialog; cancelling must not archive.
    openArchive();
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByText("common.cancel"));
    expect(mockUpdate).not.toHaveBeenCalled();
    // Reopen and confirm → archives.
    openArchive();
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

  it("keeps notes off the page: a header button opens them in a large editor", () => {
    project.content = '{"type":"doc","content":[]}';
    renderPage();
    // Nothing of the notes on the page itself.
    expect(screen.queryByTestId("content-editor")).toBeNull();
    expect(screen.queryByText("project.content.empty")).toBeNull();

    const btn = screen.getByRole("button", { name: "project.content.title" });
    expect(btn).toHaveAttribute("aria-haspopup", "dialog");
    expect(btn).toHaveAttribute("data-has-notes", "true");
    fireEvent.click(btn);
    const dialog = screen.getByRole("dialog", { name: "project.content.title" });
    const editor = within(dialog).getByTestId("content-editor");
    expect(editor.textContent).toBe("edit");
    expect(editor).toHaveAttribute("data-fill", "true");

    fireEvent.click(within(dialog).getByText("project.content.done"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("content-editor")).toBeNull();
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

  it("the notes button works with no notes yet, and shows they are empty", () => {
    renderPage();
    const btn = screen.getByRole("button", { name: "project.content.title" });
    expect(btn).toHaveAttribute("data-has-notes", "false");
    fireEvent.click(btn);
    expect(within(screen.getByRole("dialog")).getByTestId("content-editor").textContent).toBe("edit");
  });

  it("no longer offers saving the project as a template", () => {
    renderPage();
    expect(screen.queryByText("project.saveAsTemplate")).toBeNull();
  });

  it("leads with the same New task button as the Matrix, opening the shared dialog for this project", () => {
    renderPage();
    const buttons = screen.getAllByRole("button", { name: /action\.newTask/ });
    // The toolbar's primary action, plus the empty list's own prompt.
    expect(buttons[0].className).toContain("btn-primary");
    fireEvent.click(buttons[0]);
    expect(mockOpenQuickCreate).toHaveBeenCalledWith({ projectId: "p1" });
    // No second, differently styled "Add task" button in the Tasks header.
    expect(screen.queryByRole("button", { name: "project.tasks.add" })).toBeNull();
  });

  it("shows the tasks before the key goals", () => {
    const { container } = renderPage();
    const headers = Array.from(container.querySelectorAll("[data-section-header]")).map((h) => h.firstElementChild?.textContent);
    expect(headers.indexOf("project.tasks.title")).toBeGreaterThan(-1);
    expect(headers.indexOf("project.tasks.title")).toBeLessThan(headers.indexOf("project.goals.title"));
  });

  it("keeps archive and delete behind the ⋯ menu (colour is edited in the Edit dialog)", () => {
    renderPage();
    expect(screen.queryByText("project.archive")).toBeNull();
    expect(screen.queryByRole("button", { name: "green" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "project.more" }));
    const menu = screen.getByRole("menu", { name: "project.more" });
    expect(within(menu).queryByRole("button", { name: "cyan" })).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "project.delete" })).toBeInTheDocument();
    // Escape or a click outside closes it.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "project.more" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps the Stages section hidden until the header toggle opens it", () => {
    const { container } = renderPage();
    const headers = () =>
      Array.from(container.querySelectorAll("[data-section-header]")).map((h) => h.firstElementChild?.textContent);
    expect(headers()).not.toContain("stage.section");
    expect(screen.queryByRole("button", { name: "stage.edit" })).toBeNull();

    const toggle = screen.getByRole("button", { name: "stage.toggle" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(headers().indexOf("stage.section")).toBeGreaterThan(-1);
    expect(headers().indexOf("stage.section")).toBeLessThan(headers().indexOf("project.tasks.title"));
    expect(screen.getByRole("button", { name: "stage.edit" })).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(headers()).not.toContain("stage.section");
  });

  it("offers this project's completed history from the header", () => {
    renderPage();
    const btn = screen.getByRole("button", { name: "history.open" });
    expect(btn).toHaveAttribute("data-project-id", "p1");
  });
});
