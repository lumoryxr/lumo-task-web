import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { useModalA11y } from "../useModalA11y";

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  return (
    <div role="dialog" aria-modal="true" ref={ref} tabIndex={-1}>
      <button>first</button>
      <input aria-label="middle" />
      <button>last</button>
    </div>
  );
}

describe("useModalA11y", () => {
  it("closes on Escape (dispatched at window, document, or the dialog)", () => {
    for (const target of ["window", "document", "dialog"] as const) {
      const onClose = vi.fn();
      const { unmount } = render(<Dialog onClose={onClose} />);
      const where =
        target === "window" ? window : target === "document" ? document : screen.getByRole("dialog");
      fireEvent.keyDown(where, { key: "Escape" });
      expect(onClose, `Escape on ${target}`).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it("moves initial focus to the first focusable element on open", () => {
    render(<Dialog onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }));
  });

  it("traps Tab: from the last element wraps to the first", () => {
    render(<Dialog onClose={vi.fn()} />);
    const last = screen.getByRole("button", { name: "last" });
    const first = screen.getByRole("button", { name: "first" });
    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("traps Shift+Tab: from the first element wraps to the last", () => {
    render(<Dialog onClose={vi.fn()} />);
    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });
    first.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("restores focus to the trigger element when the dialog unmounts", () => {
    document.body.innerHTML = '<button id="trigger">trigger</button>';
    const trigger = document.getElementById("trigger") as HTMLButtonElement;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    const { unmount } = render(<Dialog onClose={vi.fn()} />);
    // hook moved focus into the dialog
    expect(document.activeElement).not.toBe(trigger);
    unmount();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not steal focus when the dialog already focused a child (autoFocus)", () => {
    function AutoFocusDialog() {
      const ref = useModalA11y<HTMLDivElement>(vi.fn());
      return (
        <div role="dialog" ref={ref} tabIndex={-1}>
          <button>first</button>
          <input autoFocus aria-label="auto" />
        </div>
      );
    }
    render(<AutoFocusDialog />);
    expect(document.activeElement).toBe(screen.getByLabelText("auto"));
  });
});
