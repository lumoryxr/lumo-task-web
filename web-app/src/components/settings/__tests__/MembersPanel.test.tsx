import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MembersPanel } from "../MembersPanel";
import type { Person } from "@/types/task";

vi.mock("@/i18n/useT", () => ({ useT: () => (key: string) => key }));

const mockTasks: Array<{ id: string; assignee_ids: string[]; completed: boolean }> = [];
vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: (s: { tasks: typeof mockTasks }) => unknown) => sel({ tasks: mockTasks }),
}));

const ALICE: Person = { id: "p1", name: "Alice Chen", initials: "AC", color: "#5bc8d4", email: "alice@example.com" };
const BOB: Person = { id: "p2", name: "Bob Li", initials: "BL", color: "#a8e64b" };

function setup(people: Person[] = [ALICE, BOB]) {
  const onCreate = vi.fn(async (input: Omit<Person, "id">) => ({ id: "new", ...input }));
  const onUpdate = vi.fn(async () => {});
  const onRemove = vi.fn(async () => {});
  render(<MembersPanel people={people} onCreate={onCreate} onUpdate={onUpdate} onRemove={onRemove} />);
  return { onCreate, onUpdate, onRemove };
}

describe("MembersPanel", () => {
  beforeEach(() => {
    mockTasks.length = 0;
  });

  it("shows each member as a card with name, email and open-task count, in a responsive grid", () => {
    mockTasks.push(
      { id: "t1", assignee_ids: ["p1"], completed: false },
      { id: "t2", assignee_ids: ["p2", "p1"], completed: false },
      { id: "t3", assignee_ids: ["p1"], completed: true },
    );
    setup();
    const list = screen.getByRole("list", { name: "settings.members" });
    // Columns are sized to the settings column: as many ≥260px cards as fit.
    expect(list.style.gridTemplateColumns).toContain("auto-fill");
    expect(list.style.gridTemplateColumns).toContain("260px");
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Alice Chen");
    expect(cards[0]).toHaveTextContent("alice@example.com");
    expect(cards[0]).toHaveTextContent("settings.members.openTasks");
    expect(cards[1]).toHaveTextContent("settings.members.noEmail");
  });

  it("filters the list by name or email", () => {
    setup();
    fireEvent.change(screen.getByRole("searchbox", { name: "settings.members.search" }), { target: { value: "bob" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("listitem")).toHaveTextContent("Bob Li");
    fireEvent.change(screen.getByRole("searchbox", { name: "settings.members.search" }), { target: { value: "zzz" } });
    expect(screen.getByText("settings.members.noMatch")).toBeInTheDocument();
  });

  it("adds a member in a dialog that previews the avatar and derives initials", async () => {
    const { onCreate } = setup();
    fireEvent.click(screen.getByRole("button", { name: "settings.members.add" }));
    const dialog = screen.getByRole("dialog", { name: "settings.members.new" });
    expect(dialog.className).toContain("task-dialog");
    fireEvent.change(within(dialog).getByLabelText("settings.members.name"), { target: { value: "Carol Wu" } });
    expect(within(dialog).getByTestId("member-preview")).toHaveTextContent("CW");
    fireEvent.click(within(dialog).getByRole("button", { name: "#c084fc" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "settings.members.save" }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({ name: "Carol Wu", email: undefined, initials: "CW", color: "#c084fc" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does not save without a name", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "settings.members.add" }));
    expect(screen.getByRole("button", { name: "settings.members.save" })).toBeDisabled();
  });

  it("edits a member from its card in the same dialog", async () => {
    const { onUpdate } = setup();
    fireEvent.click(screen.getByRole("button", { name: "settings.members.edit: Alice Chen" }));
    const dialog = screen.getByRole("dialog", { name: "settings.members.editTitle" });
    const name = within(dialog).getByLabelText("settings.members.name") as HTMLInputElement;
    expect(name.value).toBe("Alice Chen");
    fireEvent.change(within(dialog).getByLabelText("settings.members.email"), { target: { value: "alice@new.com" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "settings.members.save" }));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "Alice Chen", email: "alice@new.com" })),
    );
  });

  it("asks before removing a member", async () => {
    const { onRemove } = setup();
    fireEvent.click(screen.getByRole("button", { name: "settings.members.delete: Bob Li" }));
    const confirm = screen.getByRole("alertdialog");
    fireEvent.click(within(confirm).getByText("settings.members.delete"));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith("p2"));
  });

  it("shows the empty state with an Add action when there are no members", () => {
    setup([]);
    expect(screen.getByText("settings.members.empty.title")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "settings.members.add" })[0]);
    expect(screen.getByRole("dialog", { name: "settings.members.new" })).toBeInTheDocument();
  });
});
