import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectFormModal } from "../ProjectFormModal";

vi.mock("@/i18n/useT", () => ({ useT: () => (key: string) => key }));

const createMock = vi.fn();
const updateMock = vi.fn();
vi.mock("@/store/useProjectsStore", () => ({
  useProjectsStore: (sel: (s: { create: typeof createMock; update: typeof updateMock }) => unknown) =>
    sel({ create: createMock, update: updateMock }),
}));

describe("ProjectFormModal", () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({ id: "prj_1" });
    updateMock.mockReset();
    updateMock.mockResolvedValue(undefined);
  });

  it("creates a project with the entered name/category/color and calls onCreated", async () => {
    const onCreated = vi.fn();
    render(<ProjectFormModal onClose={vi.fn()} onCreated={onCreated} />);

    await userEvent.type(screen.getByPlaceholderText("project.field.namePlaceholder"), "Launch");
    await userEvent.type(screen.getByPlaceholderText("project.category.placeholder"), "Work");
    fireEvent.click(screen.getByLabelText("cyan"));
    fireEvent.click(screen.getByText("project.create"));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Launch", category: "Work", color: "cyan", status: "active" }),
      );
      expect(onCreated).toHaveBeenCalledWith({ id: "prj_1" });
    });
  });

  it("falls back to the untitled name when left blank, and seeds a first goal when given", async () => {
    render(<ProjectFormModal onClose={vi.fn()} onCreated={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("project.goals.placeholder"), "Ship v1");
    fireEvent.click(screen.getByText("project.create"));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "project.untitled",
          goals: [{ text: "Ship v1", done: false }],
        }),
      );
    });
  });

  it("edit mode prefills fields, saves via update (not create), and hides the goal field", async () => {
    const onClose = vi.fn();
    render(
      <ProjectFormModal
        onClose={onClose}
        project={{
          id: "prj_9", name: "Old name", emoji: "📁", category: "Work", color: "green",
          goals: [], status: "active", pinned: false, createdAt: "", updatedAt: "",
        }}
      />,
    );
    // Prefilled + edit-only chrome.
    expect((screen.getByLabelText("project.field.name") as HTMLInputElement).value).toBe("Old name");
    expect(screen.getByText("project.save")).toBeTruthy();
    expect(screen.queryByPlaceholderText("project.goals.placeholder")).toBeNull();

    await userEvent.clear(screen.getByLabelText("project.field.name"));
    await userEvent.type(screen.getByLabelText("project.field.name"), "New name");
    fireEvent.click(screen.getByLabelText("cyan"));
    fireEvent.click(screen.getByText("project.save"));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("prj_9", expect.objectContaining({ name: "New name", color: "cyan" }));
      expect(createMock).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("closes without creating when cancel is clicked", () => {
    const onClose = vi.fn();
    render(<ProjectFormModal onClose={onClose} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText("project.cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});
