import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VerifyEmailBanner } from "../VerifyEmailBanner";

vi.mock("@/i18n/useT", () => ({ useT: () => (k: string) => k, t: (k: string) => k }));

const mockToastSuccess = vi.fn();
vi.mock("@/store/useToastStore", () => ({
  toast: { success: (...a: unknown[]) => mockToastSuccess(...a), error: vi.fn() },
}));

const mockPresentError = vi.fn();
vi.mock("@/lib/presentError", () => ({ presentError: (...a: unknown[]) => mockPresentError(...a) }));

const mockResend = vi.fn();
const h = vi.hoisted(() => ({ signedIn: true, emailVerified: false as boolean | undefined }));
vi.mock("@/store/useAuthStore", () => ({
  selectIsSignedIn: () => h.signedIn,
  useAuthStore: (sel: (s: any) => unknown) =>
    sel({
      user: { email: "ada@example.com", emailVerified: h.emailVerified },
      resendVerification: mockResend,
    }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  h.signedIn = true;
  h.emailVerified = false;
  try { sessionStorage.clear(); } catch { /* ignore */ }
});

describe("VerifyEmailBanner", () => {
  it("renders for a signed-in unverified user and resends on click", async () => {
    mockResend.mockResolvedValue(undefined);
    render(<VerifyEmailBanner />);
    expect(screen.getByText("banner.verify.text")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "banner.verify.resend" }));
    await waitFor(() => expect(mockResend).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("banner.verify.sent"));
  });

  it("renders nothing when the email is already verified", () => {
    h.emailVerified = true;
    const { container } = render(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when signed out", () => {
    h.signedIn = false;
    const { container } = render(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("can be dismissed for the session", () => {
    render(<VerifyEmailBanner />);
    fireEvent.click(screen.getByRole("button", { name: "banner.verify.dismiss" }));
    expect(screen.queryByText("banner.verify.text")).not.toBeInTheDocument();
  });
});
