import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ForgotPasswordPage } from "../ForgotPasswordPage";

vi.mock("@/i18n/useT", () => ({ useT: () => (k: string) => k, t: (k: string) => k }));
vi.mock("@/components/AuthShell", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockPresentError = vi.fn();
vi.mock("@/lib/presentError", () => ({ presentError: (...a: unknown[]) => mockPresentError(...a) }));

const mockForgot = vi.fn();
const mockRecoveryReset = vi.fn();
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (sel: (s: { forgotPassword: typeof mockForgot; recoveryReset: typeof mockRecoveryReset }) => unknown) =>
    sel({ forgotPassword: mockForgot, recoveryReset: mockRecoveryReset }),
}));

import { ApiError } from "@/api/ApiError";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => vi.clearAllMocks());

describe("ForgotPasswordPage", () => {
  it("submits the email and shows the neutral confirmation", async () => {
    mockForgot.mockResolvedValue(undefined);
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "auth.forgot.submit" }));
    await waitFor(() => expect(mockForgot).toHaveBeenCalledWith("ada@example.com"));
    expect(await screen.findByText("auth.forgot.sent.title")).toBeInTheDocument();
  });

  it("does not submit an empty email (button disabled)", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole("button", { name: "auth.forgot.submit" })).toBeDisabled();
  });

  it("surfaces a failure through presentError and stays on the form", async () => {
    mockForgot.mockRejectedValueOnce(new Error("network"));
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "auth.forgot.submit" }));
    await waitFor(() => expect(mockPresentError).toHaveBeenCalledWith(expect.any(Error), "auth.forgot.err"));
    expect(screen.queryByText("auth.forgot.sent.title")).not.toBeInTheDocument();
  });

  describe("recovery-code branch", () => {
    function openCodeTab() {
      render(<ForgotPasswordPage />);
      fireEvent.click(screen.getByRole("button", { name: "auth.forgot.tab.code" }));
    }

    it("resets the password with username + recovery code + new password", async () => {
      mockRecoveryReset.mockResolvedValue(undefined);
      openCodeTab();
      fireEvent.change(screen.getByPlaceholderText("auth.username.ph"), { target: { value: "ada" } });
      fireEvent.change(screen.getByPlaceholderText("LUMO-XXXX-XXXX-XXXX-XXXX"), {
        target: { value: "LUMO-ABCD-EFGH-JKMN-PQRS" },
      });
      fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "BrandNew123" } });
      fireEvent.click(screen.getByRole("button", { name: "auth.forgot.code.submit" }));
      await waitFor(() =>
        expect(mockRecoveryReset).toHaveBeenCalledWith({
          username: "ada",
          code: "LUMO-ABCD-EFGH-JKMN-PQRS",
          newPassword: "BrandNew123",
        }),
      );
      expect(await screen.findByText("auth.forgot.code.success.title")).toBeInTheDocument();
    });

    it("shows an inline message for an invalid recovery code", async () => {
      mockRecoveryReset.mockRejectedValueOnce(
        new ApiError("invalid", { code: "INVALID_RECOVERY_CODE", status: 400 }),
      );
      openCodeTab();
      fireEvent.change(screen.getByPlaceholderText("auth.username.ph"), { target: { value: "ada" } });
      fireEvent.change(screen.getByPlaceholderText("LUMO-XXXX-XXXX-XXXX-XXXX"), { target: { value: "LUMO-0000-0000-0000-0000" } });
      fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "BrandNew123" } });
      fireEvent.click(screen.getByRole("button", { name: "auth.forgot.code.submit" }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("auth.forgot.code.invalid");
      expect(mockPresentError).not.toHaveBeenCalled();
    });
  });
});
