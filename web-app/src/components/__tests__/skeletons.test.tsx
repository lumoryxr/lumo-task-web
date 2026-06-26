import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Skeleton reads reducedMotion from the app store and the loading label from i18n.
vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: (s: { reducedMotion: boolean }) => unknown) =>
    sel({ reducedMotion: false }),
}));
vi.mock("@/i18n/useT", () => ({
  useT: () => (k: string) => (k === "app.loading" ? "Loading…" : k),
}));

import { TaskListSkeleton, StatsSkeleton } from "../skeletons";

describe("TaskListSkeleton", () => {
  it("exposes a single polite, busy status region for screen readers", () => {
    render(<TaskListSkeleton />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("aria-live", "polite");
    // The bars themselves stay decorative.
    expect(status.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThan(0);
  });

  it("renders one row per requested row count (plus the header bar)", () => {
    const { container } = render(<TaskListSkeleton rows={3} />);
    // header (1) + 3 rows × 3 bars each = 10 shimmer bars
    expect(container.querySelectorAll(".skeleton")).toHaveLength(1 + 3 * 3);
  });

  it("defaults to four rows", () => {
    const { container } = render(<TaskListSkeleton />);
    expect(container.querySelectorAll(".skeleton")).toHaveLength(1 + 4 * 3);
  });
});

describe("StatsSkeleton", () => {
  it("exposes a polite, busy status region", () => {
    render(<StatsSkeleton />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
  });

  it("renders three stat cards (3 bars each) plus a chart block", () => {
    const { container } = render(<StatsSkeleton />);
    expect(container.querySelectorAll(".skeleton")).toHaveLength(3 * 3 + 1);
  });
});
