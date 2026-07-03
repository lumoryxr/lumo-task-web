import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// useT echoes the key so a rendered key proves i18n routing (no hardcoded copy).
vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("@/store/useAppStore", () => ({
  useAppStore: (selector: (s: any) => unknown) => selector({ reducedMotion: false }),
}));
// Signed-in user so we pass the auth gate and reach the list area.
vi.mock("@/store/useAuthStore", () => ({
  selectIsSignedIn: () => true,
  useAuthStore: (selector: (s: any) => unknown) =>
    selector({ user: { id: "user_1" } }),
}));
// Child modals/cards are irrelevant to the loading state; stub them out.
vi.mock("@/components/HabitCalendarModal", () => ({ HabitCalendarModal: () => null }));
vi.mock("@/components/HabitCard", () => ({ HabitCard: () => <div data-testid="habit-card" /> }));
vi.mock("@/components/HabitCheckInModal", () => ({ HabitCheckInModal: () => null }));
vi.mock("@/components/HabitFormModal", () => ({ HabitFormModal: () => null }));
vi.mock("@/components/ConfirmDialog", () => ({ ConfirmDialog: () => null }));

const habitsState = {
  habits: [] as unknown[],
  logs: [] as unknown[],
  loading: false,
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  log: vi.fn(),
};
vi.mock("@/store/useHabitsStore", () => ({
  useHabitsStore: () => habitsState,
}));

import { HabitsPage } from "../HabitsPage";

beforeEach(() => {
  habitsState.habits = [];
  habitsState.logs = [];
  habitsState.loading = false;
});

describe("HabitsPage first-paint loading state", () => {
  it("shows the loading skeleton (not the empty state) while loading with no cached habits", () => {
    habitsState.loading = true;
    render(<HabitsPage />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    // The empty-state copy must NOT flash during load.
    expect(screen.queryByText("habit.empty.title")).toBeNull();
  });

  it("shows the empty state once loading settles with no habits", () => {
    habitsState.loading = false;
    render(<HabitsPage />);
    expect(screen.getByText("habit.empty.title")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not flash the skeleton on background refetch when habits are already cached", () => {
    habitsState.loading = true;
    habitsState.habits = [{ id: "h1" }];
    render(<HabitsPage />);
    // Cached content wins over the skeleton (mirrors the MatrixPage guard).
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("habit-card")).toBeTruthy();
  });
});
