import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Drive the reduced-motion branch from a mutable store stub (mirrors RouteFallback).
let mockReducedMotion = false;
vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: (s: { reducedMotion: boolean }) => unknown) =>
    sel({ reducedMotion: mockReducedMotion }),
}));

vi.mock("@/i18n/useT", () => ({
  useT: () => (k: string) => (k === "app.loading" ? "Loading…" : k),
}));

import { Skeleton, SkeletonScreen } from "../Skeleton";

describe("Skeleton", () => {
  beforeEach(() => {
    mockReducedMotion = false;
  });

  it("renders a decorative shimmer block hidden from assistive tech", () => {
    const { container } = render(<Skeleton />);
    const bar = container.querySelector(".skeleton");
    expect(bar).not.toBeNull();
    expect(bar).toHaveAttribute("aria-hidden", "true");
  });

  it("animates by default (no --still modifier)", () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector(".skeleton")).not.toHaveClass("skeleton--still");
  });

  it("disables the shimmer when reduced motion is preferred", () => {
    mockReducedMotion = true;
    const { container } = render(<Skeleton />);
    expect(container.querySelector(".skeleton")).toHaveClass("skeleton--still");
  });

  it("forwards className and style for sizing", () => {
    const { container } = render(
      <Skeleton className="h-4 w-20" style={{ borderRadius: 99 }} />
    );
    const bar = container.querySelector(".skeleton") as HTMLElement;
    expect(bar).toHaveClass("h-4", "w-20");
    expect(bar.style.borderRadius).toBe("99px");
  });
});

describe("SkeletonScreen", () => {
  beforeEach(() => {
    mockReducedMotion = false;
  });

  it("exposes a polite, busy status region for screen readers", () => {
    render(
      <SkeletonScreen>
        <Skeleton />
      </SkeletonScreen>
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
  });

  it("announces the default localized loading label", () => {
    render(
      <SkeletonScreen>
        <Skeleton />
      </SkeletonScreen>
    );
    expect(screen.getByText("Loading…")).toHaveClass("sr-only");
  });

  it("accepts a custom label override", () => {
    render(
      <SkeletonScreen label="Loading stats">
        <Skeleton />
      </SkeletonScreen>
    );
    expect(screen.getByText("Loading stats")).toBeInTheDocument();
  });

  it("renders its skeleton children", () => {
    const { container } = render(
      <SkeletonScreen>
        <Skeleton />
        <Skeleton />
      </SkeletonScreen>
    );
    expect(container.querySelectorAll(".skeleton")).toHaveLength(2);
  });
});
