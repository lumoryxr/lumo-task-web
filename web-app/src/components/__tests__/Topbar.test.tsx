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

describe("Topbar actions", () => {
  it("does not render the top-right New task action", () => {
    render(<Topbar title="Today" />);
    expect(screen.queryByRole("button", { name: "action.newTask" })).not.toBeInTheDocument();
  });

  it("keeps the search action available", () => {
    const onOpenSearch = vi.fn();
    render(<Topbar title="Today" onOpenSearch={onOpenSearch} />);
    fireEvent.click(screen.getByRole("button", { name: "topbar.search" }));
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });
});
