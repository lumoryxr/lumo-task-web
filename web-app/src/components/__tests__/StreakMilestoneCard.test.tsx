import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockToBlob = vi.fn();
const mockToastError = vi.fn();

vi.mock("html2canvas", () => ({
  default: vi.fn().mockResolvedValue({ toBlob: mockToBlob }),
}));

vi.mock("@/store/useToastStore", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

vi.mock("@/i18n/useT", () => ({
  // Echo keys, except the day-count template so {n} interpolation is exercised.
  useT: () => (k: string) => (k === "streak.milestone.days" ? "{n}-day streak" : k),
}));

// Keep the a11y hook inert in unit tests — just hand back a ref.
vi.mock("@/hooks/useModalA11y", () => ({
  useModalA11y: () => ({ current: null }),
}));

import { StreakMilestoneCard } from "../StreakMilestoneCard";

const BASE_PROPS = { milestone: 7, userName: "Test User", onDismiss: vi.fn() };

describe("StreakMilestoneCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToBlob.mockImplementation((cb: (b: Blob | null) => void) =>
      cb(new Blob(["png"], { type: "image/png" })),
    );
  });

  it("renders the milestone day count via the catalog (with {n} interpolated)", () => {
    render(<StreakMilestoneCard {...BASE_PROPS} />);
    // useT echoes the key; the component interpolates {n} → "7".
    expect(screen.getByText("7-day streak")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("exports via html2canvas when Share is clicked", async () => {
    const html2canvas = (await import("html2canvas")).default as ReturnType<typeof vi.fn>;
    render(<StreakMilestoneCard {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "stats.share.btn" }));
    await waitFor(() => expect(html2canvas).toHaveBeenCalled());
  });

  it("calls onDismiss from the Dismiss button", () => {
    const onDismiss = vi.fn();
    render(<StreakMilestoneCard {...BASE_PROPS} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "dog.levelup.dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("toasts on a genuine export failure but stays silent on share cancellation", async () => {
    const { default: html2canvas } = await import("html2canvas");
    // Genuine failure → toast.
    (html2canvas as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    render(<StreakMilestoneCard {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "stats.share.btn" }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("stats.share.error"));

    // Dismissed native share sheet (AbortError) → no toast.
    mockToastError.mockClear();
    vi.stubGlobal("navigator", {
      ...navigator,
      share: vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")),
      canShare: vi.fn().mockReturnValue(true),
    });
    render(<StreakMilestoneCard {...BASE_PROPS} />);
    fireEvent.click(screen.getAllByRole("button", { name: "stats.share.btn" })[1]);
    await waitFor(() => expect((navigator.share as ReturnType<typeof vi.fn>)).toHaveBeenCalled());
    expect(mockToastError).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
