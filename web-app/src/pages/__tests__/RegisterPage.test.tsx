import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RegisterPage } from "../RegisterPage";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/components/AuthShell", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
  t: (key: string) => key,
}));

const mockToastError = vi.fn();
vi.mock("@/store/useToastStore", () => ({
  toast: { error: (...a: unknown[]) => mockToastError(...a) },
}));

import { ApiError } from "@/api/ApiError";

const mockRegister = vi.fn();
const mockNavigate = vi.fn();
let mockLoading = false;

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: () => ({ register: mockRegister, loading: mockLoading }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup() {
  render(<RegisterPage />);
}

function getEmailInput() {
  return screen.getByLabelText("auth.email") as HTMLInputElement;
}

function getPasswordInput() {
  return screen.getByLabelText("auth.password") as HTMLInputElement;
}

function getConfirmInput() {
  return screen.getByLabelText("auth.confirm") as HTMLInputElement;
}

function getSubmitBtn() {
  return screen.getByRole("button", { name: /auth\.register\.btn|…/ });
}

function getAgreedToggle() {
  // The checkbox substitute — a <button type="button"> that toggles agreed state.
  // It renders before the submit button, so we take the first one.
  return screen.getAllByRole("button").find(
    (btn) => btn.getAttribute("type") === "button" && !btn.textContent,
  )!;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegister.mockResolvedValue(undefined);
    mockLoading = false;
  });

  it("renders email, password, confirm, and nickname fields", () => {
    setup();
    expect(getEmailInput()).toBeInTheDocument();
    expect(getPasswordInput()).toBeInTheDocument();
    expect(getConfirmInput()).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Alex")).toBeInTheDocument();
  });

  it("renders the create-account button", () => {
    setup();
    expect(screen.getByRole("button", { name: "auth.register.btn" })).toBeInTheDocument();
  });

  it("disables the submit button while loading", () => {
    mockLoading = true;
    setup();
    expect(screen.getByRole("button", { name: "…" })).toBeDisabled();
  });

  it("disables the submit button when terms are not agreed", () => {
    setup();
    // agreed starts true — toggle it off
    const toggle = getAgreedToggle();
    fireEvent.click(toggle);
    expect(getSubmitBtn()).toBeDisabled();
  });

  it("re-enables the submit button when terms are agreed again", () => {
    setup();
    const toggle = getAgreedToggle();
    fireEvent.click(toggle); // off
    fireEvent.click(toggle); // on again
    expect(getSubmitBtn()).not.toBeDisabled();
  });

  it("calls register with the typed values on submit", async () => {
    setup();
    fireEvent.change(getEmailInput(), { target: { value: "new@example.com" } });
    fireEvent.change(getPasswordInput(), { target: { value: "pass1234" } });
    fireEvent.change(getConfirmInput(), { target: { value: "pass1234" } });
    fireEvent.change(screen.getByPlaceholderText("Alex"), { target: { value: "Alex" } });
    fireEvent.click(getSubmitBtn());
    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith({
        email: "new@example.com",
        password: "pass1234",
        confirm: "pass1234",
        nickname: "Alex",
      }),
    );
  });

  it("navigates to /today on successful registration", async () => {
    setup();
    fireEvent.click(getSubmitBtn());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/today"));
  });

  it("does not navigate when register throws", async () => {
    mockRegister.mockRejectedValueOnce(new Error("Email already taken"));
    setup();
    fireEvent.click(getSubmitBtn());
    await waitFor(() => expect(mockRegister).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows no inline error for a non-validation failure — it surfaces via toast", async () => {
    mockRegister.mockRejectedValueOnce(new Error("Server error"));
    setup();
    fireEvent.click(getSubmitBtn());
    await waitFor(() => expect(mockRegister).toHaveBeenCalled());
    // A plain error carries no field detail → no inline box; routes to toast.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it("renders an inline message under the field for a validation failure", async () => {
    mockRegister.mockRejectedValueOnce(
      new ApiError("password: must include a number", {
        code: "VALIDATION_ERROR",
        status: 400,
        fields: [{ path: "password", message: "must include a number" }],
      }),
    );
    setup();
    fireEvent.click(getSubmitBtn());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("must include a number");
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
