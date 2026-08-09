import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OAuthGithubPage } from "../OAuthGithubPage";

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

const mockCompleteGithubLogin = vi.fn();
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (sel: (s: { completeGithubLogin: unknown }) => unknown) =>
    sel({ completeGithubLogin: mockCompleteGithubLogin }),
}));

const mockNavigate = vi.fn();
let search = "";
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(search)],
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup(query: string) {
  search = query;
  render(
    <MemoryRouter>
      <OAuthGithubPage />
    </MemoryRouter>,
  );
}

describe("OAuthGithubPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = "";
  });

  it("shows a connecting spinner while exchanging", () => {
    mockCompleteGithubLogin.mockReturnValue(new Promise(() => {})); // never resolves
    setup("code=handoff-123");
    expect(screen.getByText("auth.oauth.connecting")).toBeInTheDocument();
  });

  it("exchanges the handoff code and routes to /today on success", async () => {
    mockCompleteGithubLogin.mockResolvedValue(undefined);
    setup("code=handoff-123");
    await waitFor(() => expect(mockCompleteGithubLogin).toHaveBeenCalledWith("handoff-123"));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/today", { replace: true }));
  });

  it("routes to /login (with a toast) when the exchange fails", async () => {
    mockCompleteGithubLogin.mockRejectedValue(new Error("bad code"));
    setup("code=handoff-bad");
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true }));
    expect(mockToastError).toHaveBeenCalled();
  });

  it("routes to /login without exchanging when no code is present", async () => {
    setup("");
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true }));
    expect(mockCompleteGithubLogin).not.toHaveBeenCalled();
  });
});
