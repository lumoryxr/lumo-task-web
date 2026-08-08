import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AccountPage } from "../AccountPage";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
  t: (key: string) => key,
}));

vi.mock("@/components/DogEvolutionBadge", () => ({
  DogEvolutionBadge: () => null,
}));

// The a11y hook wires focus-trapping side effects we don't need under jsdom.
vi.mock("@/hooks/useModalA11y", () => ({
  useModalA11y: () => ({ current: null }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("@/store/useToastStore", () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

const mockPresentError = vi.fn();
vi.mock("@/lib/presentError", () => ({
  presentError: (...a: unknown[]) => mockPresentError(...a),
}));

const mockExportData = vi.fn();
const mockDeleteAccount = vi.fn();
const mockSignOut = vi.fn();

const USER = {
  id: "u_1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  initials: "AL",
  local: false,
  plan: "free",
  stats: { tasks: 3, pomodoros: 9, syncOK: true },
};

function state() {
  return {
    user: USER,
    signOut: mockSignOut,
    exportData: mockExportData,
    deleteAccount: mockDeleteAccount,
  };
}

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (sel: (s: ReturnType<typeof state>) => unknown) => sel(state()),
  selectIsSignedIn: () => true,
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// jsdom lacks the Blob-URL API used by the download helper.
beforeEach(() => {
  vi.clearAllMocks();
  (URL as any).createObjectURL = vi.fn(() => "blob:mock");
  (URL as any).revokeObjectURL = vi.fn();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AccountPage — data & danger zone", () => {
  it("renders the export and delete controls when signed in", () => {
    render(<AccountPage />);
    expect(screen.getByRole("button", { name: "account.export.btn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "account.delete.btn" })).toBeInTheDocument();
  });

  it("exports data and shows a success toast", async () => {
    mockExportData.mockResolvedValue({ format_version: 1, user: USER, tasks: [] });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<AccountPage />);
    fireEvent.click(screen.getByRole("button", { name: "account.export.btn" }));

    await waitFor(() => expect(mockExportData).toHaveBeenCalledTimes(1));
    expect(clickSpy).toHaveBeenCalled(); // download was triggered
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("account.export.success"));
    clickSpy.mockRestore();
  });

  it("surfaces an export failure through presentError and never crashes", async () => {
    mockExportData.mockRejectedValueOnce(new Error("network"));
    render(<AccountPage />);
    fireEvent.click(screen.getByRole("button", { name: "account.export.btn" }));
    await waitFor(() => expect(mockPresentError).toHaveBeenCalledWith(expect.any(Error), "account.export.err"));
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("gates deletion behind typing the exact email, then deletes and navigates away", async () => {
    mockDeleteAccount.mockResolvedValue(undefined);
    render(<AccountPage />);

    // Open the confirmation modal.
    fireEvent.click(screen.getByRole("button", { name: "account.delete.btn" }));
    const confirmBtn = screen.getByRole("button", { name: "account.delete.modal.cta" });

    // Disabled until the typed email matches, so a misclick can't erase anything.
    expect(confirmBtn).toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(mockDeleteAccount).not.toHaveBeenCalled();

    // Wrong email keeps it locked.
    const input = screen.getByPlaceholderText("ada@example.com");
    fireEvent.change(input, { target: { value: "someone-else@example.com" } });
    expect(confirmBtn).toBeDisabled();

    // Exact match (case-insensitive) unlocks it.
    fireEvent.change(input, { target: { value: "ADA@example.com" } });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/today"));
    expect(mockToastSuccess).toHaveBeenCalledWith("account.delete.success");
  });

  it("keeps the account and reports the error when deletion fails", async () => {
    mockDeleteAccount.mockRejectedValueOnce(new Error("boom"));
    render(<AccountPage />);
    fireEvent.click(screen.getByRole("button", { name: "account.delete.btn" }));
    fireEvent.change(screen.getByPlaceholderText("ada@example.com"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "account.delete.modal.cta" }));
    await waitFor(() => expect(mockPresentError).toHaveBeenCalledWith(expect.any(Error), "account.delete.err"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
