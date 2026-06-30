import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChangePasswordPage } from "../ChangePasswordPage";
import { ApiError } from "@/api/ApiError";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
  t: (key: string) => key,
}));

const mockToastError = vi.fn();
vi.mock("@/store/useToastStore", () => ({
  toast: { error: (...a: unknown[]) => mockToastError(...a) },
}));

const mockPresentError = vi.fn();
vi.mock("@/lib/presentError", () => ({
  presentError: (...a: unknown[]) => mockPresentError(...a),
}));

const mockChangePassword = vi.fn();
// The page reads the action via a selector: useAuthStore((s) => s.changePassword).
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (sel: (s: { changePassword: typeof mockChangePassword }) => unknown) =>
    sel({ changePassword: mockChangePassword }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup() {
  const { container } = render(<ChangePasswordPage />);
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
  return {
    current: inputs[0],
    next: inputs[1],
    confirm: inputs[2],
  };
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /account\.changePass\.save|…/ }));
}

function fillValid(fields: ReturnType<typeof setup>, current = "OldPass1") {
  fireEvent.change(fields.current, { target: { value: current } });
  fireEvent.change(fields.next, { target: { value: "NewPass1" } });
  fireEvent.change(fields.confirm, { target: { value: "NewPass1" } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ChangePasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChangePassword.mockResolvedValue(undefined);
  });

  it("renders current, new, and confirm password inputs", () => {
    const f = setup();
    expect(f.current).toBeInTheDocument();
    expect(f.next).toBeInTheDocument();
    expect(f.confirm).toBeInTheDocument();
  });

  // The original bug: the page was a mock that "succeeded" on any input without
  // ever verifying the current password. These guard that it now actually calls
  // the backend and only succeeds when the backend does.

  it("does NOT call the API and does NOT show success when fields are empty", async () => {
    setup();
    submit();
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("account.changePass.err.empty"));
    expect(mockChangePassword).not.toHaveBeenCalled();
    expect(screen.queryByText("account.changePass.success")).not.toBeInTheDocument();
  });

  it("does NOT call the API when the new passwords mismatch", async () => {
    const f = setup();
    fireEvent.change(f.current, { target: { value: "OldPass1" } });
    fireEvent.change(f.next, { target: { value: "NewPass1" } });
    fireEvent.change(f.confirm, { target: { value: "Different1" } });
    submit();
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("account.changePass.err.mismatch"));
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it("does NOT call the API when the new password has no digit (weak)", async () => {
    const f = setup();
    fireEvent.change(f.current, { target: { value: "OldPass1" } });
    fireEvent.change(f.next, { target: { value: "abcdefgh" } });
    fireEvent.change(f.confirm, { target: { value: "abcdefgh" } });
    submit();
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("account.changePass.err.weak"));
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it("calls changePassword with the entered values and shows success on resolve", async () => {
    const f = setup();
    fillValid(f, "OldPass1");
    submit();
    await waitFor(() =>
      expect(mockChangePassword).toHaveBeenCalledWith("OldPass1", "NewPass1"),
    );
    expect(await screen.findByText("account.changePass.success")).toBeInTheDocument();
  });

  it("shows the wrong-password error and NO success when the API rejects WRONG_PASSWORD", async () => {
    mockChangePassword.mockRejectedValueOnce(
      new ApiError("Current password is incorrect", { code: "WRONG_PASSWORD", status: 400 }),
    );
    const f = setup();
    fillValid(f, "totally-wrong");
    submit();
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("account.changePass.err.wrong"),
    );
    expect(screen.queryByText("account.changePass.success")).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("routes non-WRONG_PASSWORD failures through presentError, with NO success", async () => {
    mockChangePassword.mockRejectedValueOnce(new Error("network down"));
    const f = setup();
    fillValid(f);
    submit();
    await waitFor(() => expect(mockPresentError).toHaveBeenCalled());
    expect(screen.queryByText("account.changePass.success")).not.toBeInTheDocument();
  });
});
