import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginPage } from "../LoginPage";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/components/AuthShell", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/OAuthButton", () => ({
  OAuthButton: () => null,
}));

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
  t: (key: string) => key,
}));

// LegalModal (rendered by LoginPage) reads locale from the app store.
vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: (s: { locale: string }) => unknown) => sel({ locale: "en" }),
}));

const mockToastError = vi.fn();
vi.mock("@/store/useToastStore", () => ({
  toast: { error: (...a: unknown[]) => mockToastError(...a) },
}));

import { ApiError } from "@/api/ApiError";

const mockSignIn = vi.fn();
const mockNavigate = vi.fn();
let mockLoading = false;

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: () => ({ signIn: mockSignIn, loading: mockLoading }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup() {
  render(<LoginPage />);
}

function getUsernameInput() {
  return screen.getByLabelText("auth.username") as HTMLInputElement;
}

function getPasswordInput() {
  return screen.getByLabelText("auth.password") as HTMLInputElement;
}

function getSubmitBtn() {
  return screen.getByRole("button", { name: /auth\.login\.btn|…/ });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignIn.mockResolvedValue(undefined);
    mockLoading = false;
  });

  it("renders username and password fields", () => {
    setup();
    const u = getUsernameInput();
    expect(u).toBeInTheDocument();
    expect(u).toHaveAttribute("autocomplete", "username");
    expect(getPasswordInput()).toBeInTheDocument();
  });

  it("renders the sign-in button", () => {
    setup();
    expect(screen.getByRole("button", { name: "auth.login.btn" })).toBeInTheDocument();
  });

  it("disables the submit button (and marks it busy) while loading", () => {
    mockLoading = true;
    setup();
    // The label persists via aria-label while the spinner replaces the text.
    const btn = screen.getByRole("button", { name: "auth.login.btn" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("calls signIn with the typed credentials on submit", async () => {
    setup();
    fireEvent.change(getUsernameInput(), { target: { value: "alex" } });
    fireEvent.change(getPasswordInput(), { target: { value: "secret123" } });
    fireEvent.click(getSubmitBtn());
    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith("alex", "secret123"),
    );
  });

  it("navigates to /today on successful sign-in", async () => {
    setup();
    fireEvent.click(getSubmitBtn());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/today"));
  });

  it("does not navigate when signIn throws", async () => {
    mockSignIn.mockRejectedValueOnce(new Error("Invalid credentials"));
    setup();
    fireEvent.click(getSubmitBtn());
    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows no inline error for a non-validation failure — it surfaces via toast", async () => {
    mockSignIn.mockRejectedValueOnce(new Error("Bad password"));
    setup();
    fireEvent.click(getSubmitBtn());
    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    // A plain error (e.g. wrong credentials) carries no field detail → no inline
    // box; it routes through the unified toast instead.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it("renders an inline message under the field for a validation failure", async () => {
    mockSignIn.mockRejectedValueOnce(
      new ApiError("username: Required", {
        code: "VALIDATION_ERROR",
        status: 400,
        fields: [{ path: "username", message: "Required" }],
      }),
    );
    setup();
    fireEvent.click(getSubmitBtn());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Required");
    // Validation detail goes inline, NOT to the toast.
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("opens the Terms modal from the legal footer link", () => {
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "legal.terms.link" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens the Privacy modal and closes it via the close button", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "legal.privacy.link" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "legal.modal.close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
