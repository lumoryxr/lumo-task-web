import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HabitCheckInModal } from "../HabitCheckInModal";
import type { Habit, HabitLog } from "@/types/task";

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));

const HABIT: Habit = {
  id: "h1",
  title: "Morning run",
  color: "green",
  frequency: "daily",
  createdAt: "2024-01-01T00:00:00.000Z",
};

const HABIT_WITH_EMOJI: Habit = { ...HABIT, emoji: "🏃" };

const NO_LOGS: HabitLog[] = [];

const TODAY = "2026-05-19";
function log(habitId: string, date: string): HabitLog {
  return { habitId, date, completedAt: `${date}T08:00:00.000Z` };
}

const FIXED_NOW = new Date(`${TODAY}T10:00:00.000Z`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HabitCheckInModal", () => {
  it("renders habit title and confirm button", () => {
    render(
      <HabitCheckInModal habit={HABIT} logs={NO_LOGS} onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText("Morning run")).toBeInTheDocument();
    expect(screen.getByText("habit.checkin.btn")).toBeInTheDocument();
    expect(screen.getByText("habit.btn.cancel")).toBeInTheDocument();
  });

  it("renders emoji when habit has one", () => {
    render(
      <HabitCheckInModal habit={HABIT_WITH_EMOJI} logs={NO_LOGS} onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText("🏃")).toBeInTheDocument();
  });

  it("renders a motivational message", () => {
    render(
      <HabitCheckInModal habit={HABIT} logs={NO_LOGS} onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    // The motivational message key is rendered by the mocked useT
    const index = new Date().getDate() % 5;
    expect(screen.getByText(`habit.checkin.motivation.${index}`)).toBeInTheDocument();
  });

  it("shows streak badge when logs exist", () => {
    const logs = [log("h1", "2026-05-18"), log("h1", "2026-05-17")];
    render(
      <HabitCheckInModal habit={HABIT} logs={logs} onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    // Streak text and label should be visible
    expect(screen.getByText(/habit\.checkin\.streak/)).toBeInTheDocument();
  });

  it("does not show streak badge when no logs", () => {
    render(
      <HabitCheckInModal habit={HABIT} logs={NO_LOGS} onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.queryByText(/habit\.checkin\.streak/)).not.toBeInTheDocument();
  });

  it("calls onConfirm and onClose when confirm button clicked", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <HabitCheckInModal habit={HABIT} logs={NO_LOGS} onConfirm={onConfirm} onClose={onClose} />
    );
    fireEvent.click(screen.getByText("habit.checkin.btn"));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when cancel button clicked", () => {
    const onClose = vi.fn();
    render(
      <HabitCheckInModal habit={HABIT} logs={NO_LOGS} onConfirm={vi.fn()} onClose={onClose} />
    );
    fireEvent.click(screen.getByText("habit.btn.cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(
      <HabitCheckInModal habit={HABIT} logs={NO_LOGS} onConfirm={vi.fn()} onClose={onClose} />
    );
    // Modal is portaled to document.body, so query the backdrop overlay there.
    const backdrop = document.querySelector(".fixed.inset-0") as HTMLElement;
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("prevents double-confirm: confirm button disabled after first click", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <HabitCheckInModal habit={HABIT} logs={NO_LOGS} onConfirm={onConfirm} onClose={onClose} />
    );
    const btn = screen.getByText("habit.checkin.btn");
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  describe("Escape key", () => {
    beforeEach(() => {
      render(
        <HabitCheckInModal habit={HABIT} logs={NO_LOGS} onConfirm={vi.fn()} onClose={vi.fn()} />
      );
    });

    it("calls onClose on Escape keydown", () => {
      const onClose = vi.fn();
      render(
        <HabitCheckInModal habit={HABIT} logs={NO_LOGS} onConfirm={vi.fn()} onClose={onClose} />
      );
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
