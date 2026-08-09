import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthShell } from "../AuthShell";

vi.mock("@/i18n/useT", () => ({ useT: () => (k: string) => k }));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/WinControls", () => ({ WinControls: () => null }));

describe("AuthShell", () => {
  it("renders no back button by default — login is mandatory, there is no destination", () => {
    render(
      <AuthShell>
        <div>child</div>
      </AuthShell>,
    );
    expect(screen.queryByText("auth.back")).not.toBeInTheDocument();
  });

  it("renders a back button that calls onBack when a destination is provided", () => {
    const onBack = vi.fn();
    render(
      <AuthShell onBack={onBack}>
        <div>child</div>
      </AuthShell>,
    );
    fireEvent.click(screen.getByText("auth.back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
