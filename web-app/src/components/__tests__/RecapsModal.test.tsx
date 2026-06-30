import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/i18n/useT", () => ({ useT: () => (k: string) => k }));
vi.mock("@/hooks/useModalA11y", () => ({ useModalA11y: () => ({ current: null }) }));

// Stub the heavy WrappedCard (AI/dog stores) — we only assert the gallery flow.
vi.mock("@/components/WrappedCard", () => ({
  WrappedCard: ({ stats, period }: { stats: { weekLabel: string }; period?: string }) => (
    <div data-testid="wrapped-card">card:{period}:{stats.weekLabel}</div>
  ),
}));

import { RecapsModal } from "../RecapsModal";
import type { CompletedEntry } from "@/types/task";

function entry(completedAt: string): CompletedEntry {
  return { id: Math.random().toString(), title: { en: "T" }, duration: 25, completedAt };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("RecapsModal", () => {
  it("shows the empty state when there are no past recaps", () => {
    vi.setSystemTime(new Date("2024-03-20T10:00:00"));
    render(<RecapsModal entries={[]} currentStreak={3} userName="U" onClose={vi.fn()} />);
    expect(screen.getByText("recaps.empty.title")).toBeInTheDocument();
    expect(screen.queryByTestId("wrapped-card")).not.toBeInTheDocument();
  });

  it("lists past recaps and opens one as a (stubbed) WrappedCard, then goes back", () => {
    vi.setSystemTime(new Date("2024-03-20T10:00:00"));
    // A completed task in February → both a past-week and the February month recap.
    render(<RecapsModal entries={[entry("2024-02-10T10:00:00")]} currentStreak={5} userName="U" onClose={vi.fn()} />);

    // Group headings render; the month recap label is present.
    expect(screen.getByText("recaps.group.months")).toBeInTheDocument();
    const febBtn = screen.getByRole("button", { name: /February 2024/ });
    fireEvent.click(febBtn);

    // The card view opens for that period.
    expect(screen.getByTestId("wrapped-card")).toHaveTextContent("card:month:February 2024");

    // Back returns to the list.
    fireEvent.click(screen.getByRole("button", { name: "recaps.back" }));
    expect(screen.queryByTestId("wrapped-card")).not.toBeInTheDocument();
    expect(screen.getByText("recaps.group.months")).toBeInTheDocument();
  });

  it("calls onClose from the ✕ button", () => {
    vi.setSystemTime(new Date("2024-03-20T10:00:00"));
    const onClose = vi.fn();
    render(<RecapsModal entries={[]} currentStreak={0} userName="U" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "qc.close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
