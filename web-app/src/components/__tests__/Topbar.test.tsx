import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Topbar } from "../Topbar";

// Echo i18n keys so an assertion on a key proves copy routes through i18n.
vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (sel: any) => sel({ user: { name: "Jalen", initials: "J" } }),
}));

vi.mock("@/components/WinControls", () => ({ WinControls: () => null }));

describe("Topbar create-task button", () => {
  it("renders an explicit, labeled New task action (not a bare icon)", () => {
    render(<Topbar title="Today" onQuickAdd={() => {}} />);
    const btn = screen.getByRole("button", { name: "action.newTask" });
    // The visible label — the whole point of the fix — is present, not icon-only.
    expect(btn).toHaveTextContent("action.newTask");
  });

  it("invokes onQuickAdd when clicked", () => {
    const onQuickAdd = vi.fn();
    render(<Topbar title="Today" onQuickAdd={onQuickAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "action.newTask" }));
    expect(onQuickAdd).toHaveBeenCalledTimes(1);
  });
});
