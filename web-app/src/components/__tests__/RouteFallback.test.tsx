import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Drive the reduced-motion branch from a mutable store stub.
let mockReducedMotion = false;
vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: (s: { reducedMotion: boolean }) => unknown) =>
    sel({ reducedMotion: mockReducedMotion }),
}));

vi.mock("@/i18n/useT", () => ({
  useT: () => (k: string) => (k === "app.loading" ? "Loading…" : k),
}));

import { RouteFallback } from "../RouteFallback";

describe("RouteFallback", () => {
  beforeEach(() => {
    mockReducedMotion = false;
  });

  it("renders the localized loading label", () => {
    render(<RouteFallback />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("exposes a polite status region for screen readers", () => {
    render(<RouteFallback />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("animates by default (no --still modifier)", () => {
    const { container } = render(<RouteFallback />);
    const root = container.querySelector(".route-fallback");
    expect(root).not.toBeNull();
    expect(root).not.toHaveClass("route-fallback--still");
  });

  it("disables the spinner animation when reduced motion is preferred", () => {
    mockReducedMotion = true;
    const { container } = render(<RouteFallback />);
    expect(container.querySelector(".route-fallback")).toHaveClass(
      "route-fallback--still"
    );
  });

  it("hides the decorative spinner from assistive tech", () => {
    const { container } = render(<RouteFallback />);
    expect(container.querySelector(".route-fallback__spinner")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });
});
