import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ResetPasswordPage } from "../ResetPasswordPage";
import { ApiError } from "@/api/ApiError";

vi.mock("@/i18n/useT", () => ({ useT: () => (k: string) => k, t: (k: string) => k }));
vi.mock("@/components/AuthShell", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockToastError = vi.fn();
vi.mock("@/store/useToastStore", () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a) } }));

const mockPresentError = vi.fn();
vi.mock("@/lib/presentError", () => ({ presentError: (...a: unknown[]) => mockPresentError(...a) }));

const mockReset = vi.fn();
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (sel: (s: { resetPassword: typeof mockReset }) => unknown) => sel({ resetPassword: mockReset }),
}));

// Mutable holder so a test can simulate a missing token in the URL.
const h = vi.hoisted(() => ({ search: "token=tok_123" }));
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(h.search), vi.fn()],
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  h.search = "token=tok_123";
});

function fill(pw: string, confirm = pw) {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
  fireEvent.change(inputs[0], { target: { value: pw } });
  fireEvent.change(inputs[1], { target: { value: confirm } });
}

describe("ResetPasswordPage", () => {
  it("shows the invalid state when the URL has no token", () => {
    h.search = "";
    render(<ResetPasswordPage />);
    expect(screen.getByText("auth.reset.invalid.title")).toBeInTheDocument();
  });

  it("resets the password with the token and the new value, then shows success", async () => {
    mockReset.mockResolvedValue(undefined);
    render(<ResetPasswordPage />);
    fill("FreshPass123");
    fireEvent.click(screen.getByRole("button", { name: "auth.reset.submit" }));
    await waitFor(() => expect(mockReset).toHaveBeenCalledWith("tok_123", "FreshPass123"));
    expect(await screen.findByText("auth.reset.success.title")).toBeInTheDocument();
  });

  it("blocks a weak password client-side and never calls the API", async () => {
    render(<ResetPasswordPage />);
    fill("abcdefgh"); // no digit
    fireEvent.click(screen.getByRole("button", { name: "auth.reset.submit" }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("auth.reset.err.weak"));
    expect(mockReset).not.toHaveBeenCalled();
  });

  it("blocks a mismatch client-side", async () => {
    render(<ResetPasswordPage />);
    fill("FreshPass123", "Different123");
    fireEvent.click(screen.getByRole("button", { name: "auth.reset.submit" }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("auth.reset.err.mismatch"));
    expect(mockReset).not.toHaveBeenCalled();
  });

  it("shows the invalid-link state when the backend rejects the token", async () => {
    mockReset.mockRejectedValueOnce(new ApiError("bad", { code: "INVALID_RESET_TOKEN", status: 400 }));
    render(<ResetPasswordPage />);
    fill("FreshPass123");
    fireEvent.click(screen.getByRole("button", { name: "auth.reset.submit" }));
    await waitFor(() => expect(screen.getByText("auth.reset.invalid.title")).toBeInTheDocument());
    expect(mockPresentError).not.toHaveBeenCalled();
  });
});
