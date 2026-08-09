import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecoveryCodeCard } from "../RecoveryCodeCard";

vi.mock("@/i18n/useT", () => ({ useT: () => (k: string) => k, t: (k: string) => k }));

const CODE = "LUMO-ABCD-EFGH-JKMN-PQRS";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RecoveryCodeCard", () => {
  it("displays the code", () => {
    render(<RecoveryCodeCard code={CODE} />);
    expect(screen.getByTestId("recovery-code")).toHaveTextContent(CODE);
  });

  it("copies the code to the clipboard on Copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<RecoveryCodeCard code={CODE} />);
    fireEvent.click(screen.getByRole("button", { name: "auth.register.recovery.copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CODE));
    expect(await screen.findByText("auth.register.recovery.copied")).toBeInTheDocument();
  });

  it("does not render the save gate / Continue without onContinue", () => {
    render(<RecoveryCodeCard code={CODE} />);
    expect(screen.queryByRole("button", { name: "auth.register.recovery.continue" })).not.toBeInTheDocument();
  });

  it("gates Continue behind the 'I've saved it' checkbox when onContinue is provided", () => {
    const onContinue = vi.fn();
    render(<RecoveryCodeCard code={CODE} onContinue={onContinue} />);
    const cont = screen.getByRole("button", { name: "auth.register.recovery.continue" });
    expect(cont).toBeDisabled();
    fireEvent.click(cont);
    expect(onContinue).not.toHaveBeenCalled();

    // Tick the save gate → Continue enables and fires.
    fireEvent.click(screen.getByRole("button", { name: "auth.register.recovery.saved" }));
    expect(cont).not.toBeDisabled();
    fireEvent.click(cont);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
