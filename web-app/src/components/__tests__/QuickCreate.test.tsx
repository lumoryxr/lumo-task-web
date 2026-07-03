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

function setup(props: { onCreated?: () => void } = {}) {
  const onClose = vi.fn();
  const onCreated = props.onCreated ?? vi.fn();
  render(
    <MemoryRouter>
      <QuickCreate onClose={onClose} onCreated={onCreated} />
    </MemoryRouter>
  );
  return { onClose, onCreated };
}

function getCreateBtn() {
  return screen.getByText("qc.create").closest("button")!;
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
});
