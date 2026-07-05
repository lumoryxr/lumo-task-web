import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CountdownPage } from "../CountdownPage";

// Regression for the flashing empty-state on first paint (mirrors the projects
// fix #293): while countdowns are still loading and nothing is cached, the page
// must show a loading skeleton — not the "no countdowns yet" empty state.

type Event = { id: string; title: string; date: string; color: string; repeat: string; calendar: string };

const state: { events: Event[]; loaded: boolean } = { events: [], loaded: false };

vi.mock("@/store/useCountdownStore", () => ({
  useCountdownStore: () => ({
    events: state.events,
    loaded: state.loaded,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}));

// Signed-in user so the page renders its list body (not the auth gate).
vi.mock("@/store/useAuthStore", () => ({
  selectIsSignedIn: () => true,
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ user: { id: "u1", local: false } }),
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: (s: { locale: string; reducedMotion: boolean }) => unknown) =>
    sel({ locale: "en", reducedMotion: false }),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

vi.mock("@/i18n/useT", () => ({ useT: () => (k: string) => k }));

// Stub the heavy card so the test stays focused on load-state branching.
vi.mock("@/components/CountdownCard", () => ({
  CountdownCard: ({ event }: { event: Event }) => <div data-testid="cd-card">{event.title}</div>,
}));

function mk(id: string, title: string): Event {
  // A far-future date keeps it in the "upcoming" section deterministically.
  return { id, title, date: "2099-01-01", color: "green", repeat: "none", calendar: "solar" };
}

beforeEach(() => {
  state.events = [];
  state.loaded = false;
});

describe("CountdownPage initial load", () => {
  it("shows a loading skeleton (not the empty state) while loading with nothing cached", () => {
    state.loaded = false;
    state.events = [];
    const { container } = render(<CountdownPage />);
    // Skeleton shimmer bars are present…
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    // …and the empty-state copy is NOT flashed.
    expect(screen.queryByText("countdown.empty.title")).toBeNull();
  });

  it("shows the empty state (no skeleton) once loaded with zero events", () => {
    state.loaded = true;
    state.events = [];
    const { container } = render(<CountdownPage />);
    expect(container.querySelectorAll(".skeleton").length).toBe(0);
    expect(screen.getByText("countdown.empty.title")).toBeTruthy();
  });

  it("renders the countdown cards (no skeleton) once loaded with events", () => {
    state.loaded = true;
    state.events = [mk("c1", "Launch Day")];
    const { container } = render(<CountdownPage />);
    expect(container.querySelectorAll(".skeleton").length).toBe(0);
    expect(screen.getByText("Launch Day")).toBeTruthy();
  });
});
