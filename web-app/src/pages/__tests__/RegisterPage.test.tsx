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

// LegalModal (rendered by RegisterPage) reads locale from the app store.
vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: (s: { locale: string }) => unknown) => sel({ locale: "en" }),
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

function getUsernameInput() {
  // The username Field carries help text, so the wrapping <label> text isn't an
  // exact match — query by its placeholder instead.
  return screen.getByPlaceholderText("auth.username.ph") as HTMLInputElement;
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

const RECOVERY_CODE = "LUMO-ABCD-EFGH-JKMN-PQRS";

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // register resolves with the one-time recovery code.
    mockRegister.mockResolvedValue(RECOVERY_CODE);
    mockLoading = false;
  });

  it("renders username, password, and confirm fields (no email field)", () => {
    setup();
    const u = getUsernameInput();
    expect(u).toBeInTheDocument();
    expect(u).toHaveAttribute("autocomplete", "username");
    expect(getPasswordInput()).toBeInTheDocument();
    expect(getConfirmInput()).toBeInTheDocument();
    // The email field is gone in the username-first flow.
    expect(screen.queryByLabelText("auth.email")).not.toBeInTheDocument();
  });

  it("renders the create-account button", () => {
    setup();
    expect(screen.getByRole("button", { name: "auth.register.btn" })).toBeInTheDocument();
  });

  it("disables the submit button (and marks it busy) while loading", () => {
    mockLoading = true;
    setup();
    // The label persists via aria-label while the spinner replaces the text.
    const btn = screen.getByRole("button", { name: "auth.register.btn" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
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
    fireEvent.change(getUsernameInput(), { target: { value: "alex" } });
    fireEvent.change(getPasswordInput(), { target: { value: "pass1234" } });
    fireEvent.change(getConfirmInput(), { target: { value: "pass1234" } });
    fireEvent.click(getSubmitBtn());
    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith({
        username: "alex",
        password: "pass1234",
        confirm: "pass1234",
      }),
    );
  });

  it("shows the one-time recovery code and only navigates after the save gate", async () => {
    setup();
    fireEvent.click(getSubmitBtn());
    // The recovery code is presented; navigation is deferred until acknowledged.
    await screen.findByTestId("recovery-code");
    expect(screen.getByTestId("recovery-code")).toHaveTextContent(RECOVERY_CODE);
    expect(mockNavigate).not.toHaveBeenCalled();

    // The Continue button is gated on the "I've saved it" checkbox.
    const cont = screen.getByRole("button", { name: "auth.register.recovery.continue" });
    expect(cont).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "auth.register.recovery.saved" }));
    expect(cont).not.toBeDisabled();
    fireEvent.click(cont);
    expect(mockNavigate).toHaveBeenCalledWith("/today");
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

  it("opens the Terms consent link in a modal (not a new tab)", () => {
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "legal.terms.link" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opening the legal modal does not toggle the terms-agreed checkbox", () => {
    setup();
    // agreed starts true → submit enabled. Opening the modal must not flip it.
    fireEvent.click(screen.getByRole("button", { name: "legal.privacy.link" }));
    expect(getSubmitBtn()).not.toBeDisabled();
  });
});
