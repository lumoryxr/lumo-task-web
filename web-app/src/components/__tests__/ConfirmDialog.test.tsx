import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "../ConfirmDialog";

// t returns the key so we can assert on keys/labels directly.
vi.mock("@/i18n/useT", () => ({ useT: () => (k: string) => k }));

const base = {
  title: "Delete project",
  message: "Are you sure?",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    render(<ConfirmDialog {...base} open={false} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows title, message and default labels when open", () => {
    render(<ConfirmDialog {...base} open />);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("Delete project")).toBeTruthy();
    expect(screen.getByText("Are you sure?")).toBeTruthy();
    expect(screen.getByText("common.confirm")).toBeTruthy();
    expect(screen.getByText("common.cancel")).toBeTruthy();
  });

  it("fires onConfirm / onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...base} open onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("common.confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("common.cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on backdrop click and Esc", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...base} open onCancel={onCancel} />);
    // Backdrop is the alertdialog's parent (the fixed overlay).
    const backdrop = screen.getByRole("alertdialog").parentElement!;
    fireEvent.mouseDown(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("honors custom labels and detail", () => {
    render(
      <ConfirmDialog
        {...base}
        open
        danger
        confirmLabel="Delete"
        cancelLabel="Keep"
        detail="/Users/me/lumo"
      />,
    );
    expect(screen.getByText("Delete")).toBeTruthy();
    expect(screen.getByText("Keep")).toBeTruthy();
    expect(screen.getByText("/Users/me/lumo")).toBeTruthy();
  });
});
