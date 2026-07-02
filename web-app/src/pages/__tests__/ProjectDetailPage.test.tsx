import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  goals: [],
  content: undefined as string | undefined,
};

vi.mock("@/store/useProjectsStore", () => ({
  useProjectsStore: (sel: any) =>
    sel({
      projects: [project],
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
  render(<ProjectDetailPage />);
}

describe("ProjectDetailPage polish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    project.content = undefined;
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

  it("asks for confirmation before archiving", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    fireEvent.click(screen.getByText("project.archive"));
    expect(confirmSpy).toHaveBeenCalledWith("project.archiveConfirm");
    // Declined → no update.
    expect(mockUpdate).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByText("project.archive"));
    expect(mockUpdate).toHaveBeenCalledWith("p1", { status: "archived" });
    confirmSpy.mockRestore();
  });

  it("toggles notes between display and edit states", () => {
    project.content = '{"type":"doc","content":[]}';
    renderPage();
    // Display state renders the read-only editor.
    expect(screen.getByTestId("content-editor").textContent).toBe("display");

    fireEvent.click(screen.getByText("project.content.edit"));
    expect(screen.getByTestId("content-editor").textContent).toBe("edit");

    fireEvent.click(screen.getByText("project.content.done"));
    expect(screen.getByTestId("content-editor").textContent).toBe("display");
  });

  it("shows an empty-notes hint with no content, and enters edit from it", () => {
    renderPage();
    expect(screen.getByText("project.content.empty")).toBeTruthy();
    fireEvent.click(screen.getByText("project.content.edit"));
    expect(screen.getByTestId("content-editor").textContent).toBe("edit");
  });
});
