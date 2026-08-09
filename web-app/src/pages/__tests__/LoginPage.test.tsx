import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginPage } from "../LoginPage";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/components/AuthShell", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/OAuthButton", () => ({
  OAuthButton: ({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
}));

const mockGetGithubConfig = vi.fn();
const mockGithubStartUrl = vi.fn();
vi.mock("@/api/client", () => ({
  api: {
    getGithubConfig: (...a: unknown[]) => mockGetGithubConfig(...a),
    githubStartUrl: (...a: unknown[]) => mockGithubStartUrl(...a),
  },
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

const routerH = vi.hoisted(() => ({ search: "" }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(routerH.search), vi.fn()],
  };
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

/** Fill both fields so submit passes client-side presence validation and
 *  reaches the (mocked) signIn. Required now that the form validates locally. */
function fillValid({ username = "alex", password = "secret123" } = {}) {
  fireEvent.change(getUsernameInput(), { target: { value: username } });
  fireEvent.change(getPasswordInput(), { target: { value: password } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerH.search = "";
    mockSignIn.mockResolvedValue(undefined);
    mockLoading = false;
    // GitHub login defaults to DISABLED so the button stays hidden for the
    // credential-flow tests; the OAuth-specific tests override this.
    mockGetGithubConfig.mockResolvedValue({ githubEnabled: false });
    mockGithubStartUrl.mockResolvedValue("http://api.test/v1/auth/github/start");
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
    fillValid();
    fireEvent.click(getSubmitBtn());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/today"));
  });

  it("does not navigate when signIn throws", async () => {
    mockSignIn.mockRejectedValueOnce(new Error("Invalid credentials"));
    setup();
    fillValid();
    fireEvent.click(getSubmitBtn());
    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("blocks submit with a localized inline error when fields are empty", () => {
    setup();
    fireEvent.click(getSubmitBtn());
    expect(screen.getByText("auth.err.usernameRequired")).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("shows no inline error for a non-validation failure — it surfaces via toast", async () => {
    mockSignIn.mockRejectedValueOnce(new Error("Bad password"));
    setup();
    fillValid();
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
    fillValid();
    fireEvent.click(getSubmitBtn());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Required");
    // Validation detail goes inline, NOT to the toast.
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("has no 'continue without an account' escape hatch (login is mandatory)", () => {
    setup();
    expect(screen.queryByText("auth.localonly")).not.toBeInTheDocument();
  });

  it("REGRESSION: a validation error for a field this form does NOT render surfaces a toast, never a silent no-op", async () => {
    mockSignIn.mockRejectedValueOnce(
      new ApiError("email: Invalid", {
        code: "VALIDATION_ERROR",
        status: 400,
        fields: [{ path: "email", message: "Invalid" }],
      }),
    );
    setup();
    fillValid();
    fireEvent.click(getSubmitBtn());
    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows a toast when redirected back with ?error=oauth (failed GitHub sign-in)", () => {
    routerH.search = "error=oauth";
    setup();
    expect(mockToastError).toHaveBeenCalledWith("auth.oauth.err");
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

  describe("GitHub login button (env-gated)", () => {
    // Setting window.location.href throws "navigation not implemented" in jsdom,
    // so swap it for a writable plain object we can assert against.
    const realLocation = window.location;
    beforeEach(() => {
      Object.defineProperty(window, "location", { configurable: true, writable: true, value: { href: "" } });
    });
    afterEach(() => {
      Object.defineProperty(window, "location", { configurable: true, writable: true, value: realLocation });
    });

    it("hides the GitHub button (and 'or' divider) when the server reports it disabled", async () => {
      mockGetGithubConfig.mockResolvedValue({ githubEnabled: false });
      setup();
      // Let the mount config fetch resolve, then assert the button never appears.
      await waitFor(() => expect(mockGetGithubConfig).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: "auth.github" })).not.toBeInTheDocument();
      expect(screen.queryByText("auth.or")).not.toBeInTheDocument();
    });

    it("shows the GitHub button when enabled and full-page-redirects to /start on click", async () => {
      mockGetGithubConfig.mockResolvedValue({ githubEnabled: true });
      setup();
      const btn = await screen.findByRole("button", { name: "auth.github" });
      fireEvent.click(btn);
      await waitFor(() => expect(mockGithubStartUrl).toHaveBeenCalled());
      await waitFor(() =>
        expect(window.location.href).toBe("http://api.test/v1/auth/github/start"),
      );
    });
  });
});
