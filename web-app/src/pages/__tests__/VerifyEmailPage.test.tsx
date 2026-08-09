import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { VerifyEmailPage } from "../VerifyEmailPage";
import { ApiError } from "@/api/ApiError";

vi.mock("@/i18n/useT", () => ({ useT: () => (k: string) => k, t: (k: string) => k }));
vi.mock("@/components/AuthShell", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockPresentError = vi.fn();
vi.mock("@/lib/presentError", () => ({ presentError: (...a: unknown[]) => mockPresentError(...a) }));

const mockVerify = vi.fn();
const mockRefresh = vi.fn();
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (
    sel: (s: {
      verifyEmail: typeof mockVerify;
      refreshUser: typeof mockRefresh;
      user: { local: boolean; id: string };
    }) => unknown,
  ) => sel({ verifyEmail: mockVerify, refreshUser: mockRefresh, user: { local: false, id: "u_1" } }),
  selectIsSignedIn: (s: { user: { local: boolean; id: string } }) => !s.user.local && s.user.id !== "local",
}));

const h = vi.hoisted(() => ({ search: "token=evt_123" }));
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
  h.search = "token=evt_123";
  mockRefresh.mockResolvedValue(undefined);
});

describe("VerifyEmailPage", () => {
  it("auto-verifies the token on mount and refreshes the user on success", async () => {
    mockVerify.mockResolvedValue(undefined);
    render(<VerifyEmailPage />);
    await waitFor(() => expect(mockVerify).toHaveBeenCalledWith("evt_123"));
    expect(mockRefresh).toHaveBeenCalled();
    expect(await screen.findByText("auth.verify.success.title")).toBeInTheDocument();
  });

  it("shows the invalid state when there is no token (never calls the API)", async () => {
    h.search = "";
    render(<VerifyEmailPage />);
    expect(screen.getByText("auth.verify.invalid.title")).toBeInTheDocument();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("shows the invalid state when the token is rejected", async () => {
    mockVerify.mockRejectedValueOnce(new ApiError("bad", { code: "INVALID_VERIFICATION_TOKEN", status: 400 }));
    render(<VerifyEmailPage />);
    await waitFor(() => expect(screen.getByText("auth.verify.invalid.title")).toBeInTheDocument());
    expect(mockPresentError).not.toHaveBeenCalled();
  });
});
