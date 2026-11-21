import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QuickCreate } from "../QuickCreate";
import { useTaskDraftsStore } from "@/store/useTaskDraftsStore";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockCreate = vi.fn();

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: any) => sel({ create: mockCreate, tasks: [] }),
}));

let mockPeople: Array<{ id: string; name: string; initials: string; color: string }> = [];
vi.mock("@/store/usePeopleStore", () => ({
  usePeopleStore: (sel: any) => sel({ people: mockPeople }),
}));

// Mutable so individual tests can populate the project list; defaults to empty
// (project selector hidden) to keep the pre-existing cases unchanged.
let mockProjects: Array<{ id: string; name: string; emoji?: string }> = [];
vi.mock("@/store/useProjectsStore", () => ({
  useProjectsStore: (sel: any) => sel({ projects: mockProjects }),
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: any) => sel({ locale: "en" }),
}));

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup(props: { onCreated?: () => void; projectId?: string; sectionId?: string } = {}) {
  const onClose = vi.fn();
  const onCreated = props.onCreated ?? vi.fn();
  const utils = render(
    <MemoryRouter>
      <QuickCreate onClose={onClose} onCreated={onCreated} projectId={props.projectId} sectionId={props.sectionId} />
    </MemoryRouter>
  );
  return { onClose, onCreated, ...utils };
}

function getCreateBtn() {
  // Query by accessible name (persists via aria-label) — while a create is
  // in-flight the visible label is swapped for a spinner.
  return screen.getByRole("button", { name: "qc.create" });
}

/** Expands the collapsed "More options" section. */
function openMore() {
  const toggle = screen.getByRole("button", { name: /^qc\.more/ });
  if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
}

function getTitleInput() {
  // Target the title field by placeholder — the tag input is also a textbox.
  return screen.getByPlaceholderText("qc.placeholder") as HTMLInputElement;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("QuickCreate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({});
    mockProjects = [];
    localStorage.clear();
    useTaskDraftsStore.setState({ createDraft: null, editDrafts: {} });
  });

  it("disables create button when title is empty", () => {
    setup();
    expect(getCreateBtn()).toBeDisabled();
  });

  it("enables create button when title has content", () => {
    setup();
    fireEvent.change(getTitleInput(), { target: { value: "My task" } });
    expect(getCreateBtn()).not.toBeDisabled();
  });

  it("disables create button while submission is in-flight", async () => {
    let resolve!: () => void;
    mockCreate.mockReturnValueOnce(new Promise<void>((res) => { resolve = res; }));

    setup();
    fireEvent.change(getTitleInput(), { target: { value: "My task" } });

    fireEvent.click(getCreateBtn());
    await waitFor(() => expect(getCreateBtn()).toBeDisabled());

    resolve();
    await waitFor(() => expect(getCreateBtn()).not.toBeDisabled());
  });

  it("calls onCreated after successful submit", async () => {
    const onCreated = vi.fn();
    setup({ onCreated });

    fireEvent.change(getTitleInput(), { target: { value: "My task" } });
    fireEvent.click(getCreateBtn());

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("does not close on Escape or a click outside — only the X closes it", () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes straight away from the X when nothing was typed", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "qc.close" }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  describe("draft", () => {
    it("asks whether to keep the draft when closing with unsaved input", () => {
      const { onClose } = setup();
      fireEvent.change(getTitleInput(), { target: { value: "Plan launch" } });
      fireEvent.click(screen.getByRole("button", { name: "qc.close" }));
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("alertdialog", { name: "draft.exit.title" })).toBeInTheDocument();
    });

    it("keeps editing when asked", () => {
      const { onClose } = setup();
      fireEvent.change(getTitleInput(), { target: { value: "Plan launch" } });
      fireEvent.click(screen.getByRole("button", { name: "qc.close" }));
      fireEvent.click(screen.getByRole("button", { name: "draft.exit.continue" }));
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(getTitleInput().value).toBe("Plan launch");
    });

    it("the Cancel button asks too", () => {
      const { onClose } = setup();
      fireEvent.change(getTitleInput(), { target: { value: "Plan launch" } });
      fireEvent.click(screen.getByRole("button", { name: "qc.cancel" }));
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    it("keeps the draft, and restores it the next time the form opens", () => {
      const first = setup();
      fireEvent.change(getTitleInput(), { target: { value: "Plan launch" } });
      fireEvent.click(screen.getByRole("button", { name: /^Q1/ }));
      fireEvent.click(screen.getByRole("button", { name: "qc.close" }));
      fireEvent.click(screen.getByRole("button", { name: "draft.exit.keep" }));
      expect(first.onClose).toHaveBeenCalled();
      first.unmount();

      setup();
      expect(getTitleInput().value).toBe("Plan launch");
      expect(screen.getByRole("button", { name: /^Q1/ })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText("draft.restored")).toBeInTheDocument();
    });

    it("discards the draft when asked", () => {
      const first = setup();
      fireEvent.change(getTitleInput(), { target: { value: "Plan launch" } });
      fireEvent.click(screen.getByRole("button", { name: "qc.close" }));
      fireEvent.click(screen.getByRole("button", { name: "draft.exit.discard" }));
      expect(first.onClose).toHaveBeenCalled();
      first.unmount();

      setup();
      expect(getTitleInput().value).toBe("");
      expect(screen.queryByText("draft.restored")).toBeNull();
    });

    it("saves the draft as you type, so it survives a reload", () => {
      setup();
      fireEvent.change(getTitleInput(), { target: { value: "Plan launch" } });
      expect(useTaskDraftsStore.getState().createDraft?.title).toBe("Plan launch");
    });

    it("can clear a restored draft back to an empty form", () => {
      useTaskDraftsStore.getState().saveCreateDraft({
        title: "Old idea", quadrant: "Q4", duration: 30, dueDate: "", assigneeIds: [], recurrence: "none", tags: [], projectId: null,
      });
      setup();
      expect(getTitleInput().value).toBe("Old idea");
      fireEvent.click(screen.getByRole("button", { name: "draft.clear" }));
      expect(getTitleInput().value).toBe("");
      expect(useTaskDraftsStore.getState().createDraft).toBeNull();
      expect(screen.queryByText("draft.restored")).toBeNull();
    });

    it("drops the draft once the task is created", async () => {
      setup();
      fireEvent.change(getTitleInput(), { target: { value: "Plan launch" } });
      fireEvent.click(getCreateBtn());
      await waitFor(() => expect(mockCreate).toHaveBeenCalled());
      await waitFor(() => expect(useTaskDraftsStore.getState().createDraft).toBeNull());
    });
  });

  it("submits on Ctrl+Enter", async () => {
    setup();
    fireEvent.change(getTitleInput(), { target: { value: "My task" } });
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  });

  it("includes tags entered before submit in the create payload", async () => {
    setup();
    fireEvent.change(getTitleInput(), { target: { value: "My task" } });

    openMore();
    const tagInput = screen.getByPlaceholderText("edit.tags.placeholder") as HTMLInputElement;
    fireEvent.change(tagInput, { target: { value: "work" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });

    fireEvent.click(getCreateBtn());

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ tags: ["work"] });
  });

  it("files the task under the given project when projectId is set", async () => {
    setup({ projectId: "prj_abc" });
    fireEvent.change(getTitleInput(), { target: { value: "Scoped task" } });
    fireEvent.click(getCreateBtn());

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ project_id: "prj_abc" });
  });

  it("files the task into the given project group", async () => {
    setup({ projectId: "prj_abc", sectionId: "sec_1" });
    fireEvent.change(getTitleInput(), { target: { value: "Grouped task" } });
    fireEvent.click(getCreateBtn());

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ project_id: "prj_abc", section_id: "sec_1" });
  });

  it("omits section_id when no group is given", async () => {
    setup({ projectId: "prj_abc" });
    fireEvent.change(getTitleInput(), { target: { value: "Loose task" } });
    fireEvent.click(getCreateBtn());

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("section_id");
  });

  it("omits project_id when no projectId is given (global create)", async () => {
    setup();
    fireEvent.change(getTitleInput(), { target: { value: "Global task" } });
    fireEvent.click(getCreateBtn());

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("project_id");
  });

  // ── Project selector (#211) ──────────────────────────────────────────────

  // The project picker is a custom dropdown (not a native <select>): its
  // trigger is a button (aria-label persists), and options are role="option"
  // buttons rendered in a portal once the menu is open.
  function getProjectTrigger() {
    openMore();
    return screen.getByRole("button", { name: "project.select.label" });
  }

  function pickProject(optionName: string) {
    fireEvent.click(getProjectTrigger());
    fireEvent.click(screen.getByRole("option", { name: optionName }));
  }

  it("shows the project selector only when projects exist", () => {
    const first = setup();
    openMore();
    expect(screen.queryByRole("button", { name: "project.select.label" })).toBeNull();
    first.unmount();

    mockProjects = [{ id: "prj_a", name: "Alpha" }];
    setup();
    expect(getProjectTrigger()).toBeTruthy();
  });

  it("files the task under the project picked in the selector", async () => {
    mockProjects = [
      { id: "prj_a", name: "Alpha" },
      { id: "prj_b", name: "Beta" },
    ];
    setup();
    fireEvent.change(getTitleInput(), { target: { value: "Picked task" } });
    pickProject("Beta");
    fireEvent.click(getCreateBtn());

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ project_id: "prj_b" });
  });

  it("prefills the selector from the projectId prop and lets the user change it", async () => {
    mockProjects = [
      { id: "prj_a", name: "Alpha" },
      { id: "prj_b", name: "Beta" },
    ];
    setup({ projectId: "prj_a" });
    expect(getProjectTrigger().textContent).toContain("Alpha");

    fireEvent.change(getTitleInput(), { target: { value: "Moved task" } });
    pickProject("Beta");
    fireEvent.click(getCreateBtn());

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ project_id: "prj_b" });
  });

  it("drops project_id when the prefilled project is cleared to none", async () => {
    mockProjects = [{ id: "prj_a", name: "Alpha" }];
    setup({ projectId: "prj_a" });
    fireEvent.change(getTitleInput(), { target: { value: "Unfiled task" } });
    pickProject("project.select.none");
    fireEvent.click(getCreateBtn());

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("project_id");
  });

  describe("a short form: only what most tasks need is up front", () => {
    it("shows name, quadrant and due date; tucks estimate, repeat and tags under More options", () => {
      setup();
      expect(getTitleInput()).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Q1/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "due.today" })).toBeInTheDocument();
      const more = screen.getByRole("button", { name: /^qc\.more/ });
      expect(more).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByPlaceholderText("edit.tags.placeholder")).toBeNull();
      expect(screen.queryByText("task.recurrence")).toBeNull();
      expect(screen.queryByText("qc.duration")).toBeNull();

      fireEvent.click(more);
      expect(more).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByPlaceholderText("edit.tags.placeholder")).toBeInTheDocument();
      expect(screen.getByText("task.recurrence")).toBeInTheDocument();
      expect(screen.getByText("qc.duration")).toBeInTheDocument();
    });

    it("the More toggle lists what is set inside it, so nothing hides unnoticed", () => {
      setup();
      openMore();
      fireEvent.click(screen.getByRole("button", { name: "task.recurrence.daily" }));
      fireEvent.click(screen.getByRole("button", { name: /^qc\.more/ }));
      expect(screen.getByRole("button", { name: /^qc\.more/ })).toHaveTextContent("task.recurrence.daily");
    });

    it("opens More options by itself when a restored draft has something set there", () => {
      useTaskDraftsStore.getState().saveCreateDraft({
        title: "Weekly sync", quadrant: "Q2", duration: 30, dueDate: "", assigneeIds: [],
        recurrence: "weekly", tags: [], projectId: null,
      });
      setup();
      expect(screen.getByRole("button", { name: /^qc\.more/ })).toHaveAttribute("aria-expanded", "true");
    });

    it("can create a task with just a name", async () => {
      setup();
      fireEvent.change(getTitleInput(), { target: { value: "Just a name" } });
      fireEvent.click(getCreateBtn());
      await waitFor(() => expect(mockCreate).toHaveBeenCalled());
      expect(mockCreate.mock.calls[0][0]).toMatchObject({ title: { en: "Just a name" }, quadrant: "Q2", duration: 30 });
    });
  });

  describe("assignees", () => {
    beforeEach(() => {
      mockPeople = [
        { id: "p_ann", name: "Ann", initials: "A", color: "var(--accent-primary)" },
        { id: "p_bo", name: "Bo", initials: "B", color: "var(--accent-primary)" },
        { id: "p_cy", name: "Cy", initials: "C", color: "var(--accent-primary)" },
      ];
    });

    it("picks one owner up front; collaborators are under More options", async () => {
      setup();
      fireEvent.change(getTitleInput(), { target: { value: "My task" } });
      const owner = screen.getByRole("radiogroup", { name: "assignee.primaryLabel" });
      expect(screen.queryByRole("group", { name: "assignee.others" })).toBeNull();
      fireEvent.click(within(owner).getByRole("radio", { name: "Bo" }));
      openMore();
      const collab = screen.getByRole("group", { name: "assignee.others" });
      fireEvent.click(within(collab).getByRole("button", { name: "Cy" }));
      fireEvent.click(within(collab).getByRole("button", { name: "Ann" }));
      fireEvent.click(getCreateBtn());
      await waitFor(() => expect(mockCreate).toHaveBeenCalled());
      expect(mockCreate.mock.calls[0][0].assignee_ids).toEqual(["p_bo", "p_cy", "p_ann"]);
    });

    it("only one owner: picking another replaces the first", async () => {
      setup();
      fireEvent.change(getTitleInput(), { target: { value: "My task" } });
      const owner = screen.getByRole("radiogroup", { name: "assignee.primaryLabel" });
      fireEvent.click(within(owner).getByRole("radio", { name: "Bo" }));
      fireEvent.click(within(owner).getByRole("radio", { name: "Ann" }));
      expect(within(owner).getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
      fireEvent.click(getCreateBtn());
      await waitFor(() => expect(mockCreate).toHaveBeenCalled());
      expect(mockCreate.mock.calls[0][0].assignee_ids).toEqual(["p_ann"]);
    });
  });
});

describe("responsive dialog frame", () => {
  it("uses the shared task-dialog frame: screen-relative size, pinned header and footer, scrolling body", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("task-dialog");
    expect(dialog.parentElement).toHaveClass("task-dialog-backdrop");
    // No fixed pixel width / viewport-percent height baked into the element.
    expect(dialog.style.maxWidth).toBe("");
    expect(dialog.style.maxHeight).toBe("");
    expect(dialog.style.marginTop).toBe("");
    const body = dialog.querySelector(".task-dialog__body");
    expect(body).not.toBeNull();
    // Header (with the X) and footer stay outside the scrolling body.
    const close = screen.getByRole("button", { name: "qc.close" });
    expect(body?.contains(close)).toBe(false);
    const footer = dialog.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(body?.contains(footer)).toBe(false);
  });
});
