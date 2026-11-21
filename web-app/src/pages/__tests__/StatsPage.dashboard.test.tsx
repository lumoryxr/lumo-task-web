import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StatsPage } from "../StatsPage";

// The dashboard reads completed entries; two of them fall in the last 7 days
// and a third between 8 and 30 days ago, so switching the range changes totals.
function daysAgo(n: number, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
const ENTRIES = [
  { id: "e1", title: { en: "A" }, duration: 30, completedAt: daysAgo(0), quadrant: "Q2", projectId: "p1", tags: ["deep"] },
  { id: "e2", title: { en: "B" }, duration: 20, completedAt: daysAgo(1), quadrant: "Q1", projectId: "p1" },
  { id: "e3", title: { en: "C" }, duration: 10, completedAt: daysAgo(12), quadrant: "Q2" },
];

vi.mock("@/i18n/useT", () => ({ useT: () => (key: string) => key }));
vi.mock("@/store/useAuthStore", () => ({
  selectIsSignedIn: () => true,
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const state = { user: { id: "u-dash", name: "Tester" } };
    return sel ? sel(state) : state;
  },
}));
vi.mock("@/store/useAppStore", () => ({ useAppStore: (sel: (s: unknown) => unknown) => sel({ locale: "en" }) }));
vi.mock("@/store/useHabitsStore", () => ({ useHabitsStore: () => ({ habits: [], logs: [] }) }));
vi.mock("@/store/useProjectsStore", () => ({
  useProjectsStore: (sel: (s: unknown) => unknown) => sel({ projects: [{ id: "p1", name: "Launch", emoji: "🚀" }] }),
}));
vi.mock("@/store/useTasksStore", () => {
  const useTasksStore = (() => ({})) as unknown as { (): unknown; getState: () => unknown };
  useTasksStore.getState = () => ({ fetchAllCompleted: () => Promise.resolve(ENTRIES) });
  return { useTasksStore };
});
vi.mock("@/components/ShareCard", () => ({ ShareCard: () => null }));
vi.mock("@/components/WrappedCard", () => ({ WrappedCard: () => null }));
vi.mock("@/components/RecapsModal", () => ({ RecapsModal: () => null }));
vi.mock("@/components/StreakMilestoneCard", () => ({ StreakMilestoneCard: () => null }));
vi.mock("@/components/HabitWeekSection", () => ({ HabitWeekSection: () => null }));

function renderPage() {
  return render(
    <MemoryRouter>
      <StatsPage />
    </MemoryRouter>,
  );
}

describe("StatsPage dashboard", () => {
  it("lays out KPIs, the daily chart, highlights, quadrants, hours, projects, tags and all time", async () => {
    renderPage();
    expect(await screen.findByRole("group", { name: "stats.kpi.tasks" })).toBeInTheDocument();
    for (const name of ["stats.kpi.focus", "stats.kpi.streak", "stats.kpi.avg"]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
    }
    for (const name of [
      "stats.trend.title", "stats.highlights.title", "stats.quad.title", "stats.heat.title",
      "stats.projects.title", "stats.tags.title",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "stats.alltime" })).toBeInTheDocument();
    // Project names, not ids, in the ranking.
    expect(within(screen.getByRole("region", { name: "stats.projects.title" })).getByText("Launch")).toBeInTheDocument();
  });

  it("scopes the numbers to the chosen range (30 days by default)", async () => {
    renderPage();
    const tasks = await screen.findByRole("group", { name: "stats.kpi.tasks" });
    expect(screen.getByRole("radio", { name: "stats.range.30" })).toHaveAttribute("aria-checked", "true");
    expect(tasks).toHaveTextContent(/^.*stats\.kpi\.tasks3/);

    fireEvent.click(screen.getByRole("radio", { name: "stats.range.7" }));
    expect(screen.getByRole("radio", { name: "stats.range.7" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("group", { name: "stats.kpi.tasks" })).toHaveTextContent(/stats\.kpi\.tasks2/);
  });
});
