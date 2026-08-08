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
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (sel: (s: { forgotPassword: typeof mockForgot }) => unknown) => sel({ forgotPassword: mockForgot }),
}));

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
});
