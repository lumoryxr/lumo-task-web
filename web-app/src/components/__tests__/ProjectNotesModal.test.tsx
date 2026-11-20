import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectNotesModal } from "../ProjectNotesModal";

vi.mock("@/i18n/useT", () => ({ useT: () => (key: string) => key }));
vi.mock("@/components/ProjectContentEditor", () => ({
  ProjectContentEditor: ({ fill, value }: { fill?: boolean; value?: string }) => (
    <div data-testid="editor" data-fill={fill ? "true" : "false"}>{value}</div>
  ),
}));

describe("ProjectNotesModal", () => {
  it("is a large dialog whose editor fills it", () => {
    render(<ProjectNotesModal value="hello" onChange={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "project.content.title" });
    expect(dialog).toHaveAttribute("data-size", "large");
    expect(screen.getByTestId("editor")).toHaveAttribute("data-fill", "true");
    expect(screen.getByTestId("editor").textContent).toBe("hello");
  });

  it("closes from the X and from Done", () => {
    const onClose = vi.fn();
    render(<ProjectNotesModal onChange={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "qc.close" }));
    fireEvent.click(screen.getByText("project.content.done"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
