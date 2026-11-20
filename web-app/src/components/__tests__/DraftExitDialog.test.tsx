import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DraftExitDialog } from "../DraftExitDialog";

vi.mock("@/i18n/useT", () => ({ useT: () => (key: string) => key }));

function setup(open = true) {
  const handlers = { onKeep: vi.fn(), onDiscard: vi.fn(), onContinue: vi.fn() };
  render(<DraftExitDialog open={open} {...handlers} />);
  return handlers;
}

describe("DraftExitDialog", () => {
  it("renders nothing while closed", () => {
    setup(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("offers keep, discard and keep-editing", () => {
    const h = setup();
    expect(screen.getByRole("alertdialog", { name: "draft.exit.title" })).toBeInTheDocument();
    expect(screen.getByText("draft.exit.message")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "draft.exit.keep" }));
    expect(h.onKeep).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "draft.exit.discard" }));
    expect(h.onDiscard).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "draft.exit.continue" }));
    expect(h.onContinue).toHaveBeenCalledTimes(1);
  });

  it("focuses Keep, the safe choice", () => {
    setup();
    expect(screen.getByRole("button", { name: "draft.exit.keep" })).toHaveFocus();
  });

  it("Escape or a click outside means keep editing — never discard", () => {
    const h = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(screen.getByRole("alertdialog").parentElement!);
    expect(h.onContinue).toHaveBeenCalledTimes(2);
    expect(h.onDiscard).not.toHaveBeenCalled();
    expect(h.onKeep).not.toHaveBeenCalled();
  });
});
