import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { HabitsPage } from "../HabitsPage";
import { StatsPage } from "../StatsPage";

/**
 * Regression guard for issue #133.
 *
 * The Topbar (src/components/Topbar.tsx) uses `px-7` horizontal padding. Each
 * main page's content column must use the same token so its left edge lines up
 * with the Topbar title — on wide viewports a mismatch (px-6 / px-8) was clearly
 * visible. These tests pin the contract: the page header lives in a `px-7`
 * container and does NOT regress to `px-6` / `px-8`.
 */

// Topbar.tsx: className="flex items-center gap-4 px-7 ..."
const TOPBAR_PADDING = "px-7";

// ── Shared mocks ────────────────────────────────────────────────────────────
vi.mock("@/i18n/useT", () => ({ useT: () => (key: string) => key }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/icons", () => ({
  IconHabit: () => null,
  IconPlus: () => null,
  IconStats: () => null,
  IconCalendar: () => null,
}));

vi.mock("@/store/useAuthStore", () => ({
  selectIsSignedIn: () => true,
  useAuthStore: (selector?: (s: unknown) => unknown) => {
    const state = { user: { id: "u1", name: "Tester" } };
    return selector ? selector(state) : state;
  },
}));

vi.mock("@/store/useHabitsStore", () => ({
  useHabitsStore: () => ({
    habits: [],
    logs: [],
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    log: vi.fn(),
    unlog: vi.fn(),
  }),
}));

// HabitsPage child modals — render nothing so we only assert layout shell.
vi.mock("@/components/HabitCalendarModal", () => ({ HabitCalendarModal: () => null }));
vi.mock("@/components/HabitCheckInModal", () => ({ HabitCheckInModal: () => null }));
vi.mock("@/components/HabitFormModal", () => ({ HabitFormModal: () => null }));
vi.mock("@/components/HabitCard", () => ({ HabitCard: () => null }));

// StatsPage dependencies.
vi.mock("@/components/ShareCard", () => ({ ShareCard: () => null }));
vi.mock("@/components/WrappedCard", () => ({ WrappedCard: () => null }));
vi.mock("@/store/useAppStore", () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector({ locale: "en" }),
}));
vi.mock("@/store/useTasksStore", () => {
  const useTasksStore = (() => ({})) as unknown as {
    (): unknown;
    getState: () => unknown;
  };
  useTasksStore.getState = () => ({ fetchAllCompleted: () => Promise.resolve([]) });
  return { useTasksStore };
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function headerOf(container: HTMLElement) {
  const h1 = container.querySelector("h1");
  expect(h1, "page should render an <h1> header").not.toBeNull();
  // The padded column is the header's ancestor that owns the horizontal padding.
  // A page may tighten the gutter on phones (`px-4 sm:px-7`); from `sm` up it
  // must still match the Topbar.
  return h1!.closest(`.${TOPBAR_PADDING}, .sm\\:${TOPBAR_PADDING}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("page horizontal padding aligns with Topbar (issue #133)", () => {
  it("HabitsPage header uses the Topbar px-7 token", () => {
    const { container } = render(<HabitsPage />);
    expect(headerOf(container)).not.toBeNull();
    // Guard against the pre-fix values resurfacing on a page-level container.
    expect(container.querySelector("h1")!.closest(".px-6")).toBeNull();
    expect(container.querySelector("h1")!.closest(".px-8")).toBeNull();
  });

  it("StatsPage header uses the Topbar px-7 token", async () => {
    const { container } = render(<StatsPage />);
    await waitFor(() => expect(headerOf(container)).not.toBeNull());
    expect(container.querySelector("h1")!.closest(".px-6")).toBeNull();
    expect(container.querySelector("h1")!.closest(".px-8")).toBeNull();
  });
});
