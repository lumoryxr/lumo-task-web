import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QuickCreate } from "../QuickCreate";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockCreate = vi.fn();

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: any) => sel({ create: mockCreate, tasks: [] }),
}));

vi.mock("@/store/usePeopleStore", () => ({
  usePeopleStore: (sel: any) => sel({ people: [] }),
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: any) => sel({ locale: "en" }),
}));

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup(props: { onCreated?: () => void; projectId?: string } = {}) {
  const onClose = vi.fn();
  const onCreated = props.onCreated ?? vi.fn();
  render(
    <MemoryRouter>
      <QuickCreate onClose={onClose} onCreated={onCreated} projectId={props.projectId} />
    </MemoryRouter>
  );
  return { onClose, onCreated };
}

function getCreateBtn() {
  // Query by accessible name (persists via aria-label) — while a create is
  // in-flight the visible label is swapped for a spinner.
  return screen.getByRole("button", { name: "qc.create" });
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

  it("calls onClose when Escape is pressed", () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
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

  it("omits project_id when no projectId is given (global create)", async () => {
    setup();
    fireEvent.change(getTitleInput(), { target: { value: "Global task" } });
    fireEvent.click(getCreateBtn());

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("project_id");
  });
});
