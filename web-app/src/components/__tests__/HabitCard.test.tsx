import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HabitCard } from "../HabitCard";
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

const HABIT_WITH_EMOJI: Habit = {
  ...HABIT,
  emoji: "🏃",
};

const TODAY = "2026-05-19";
const FIXED_NOW = new Date(`${TODAY}T10:00:00.000Z`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function log(habitId: string, date: string): HabitLog {
  return { habitId, date, completedAt: `${date}T08:00:00.000Z` };
}

describe("HabitCard", () => {
  it("renders the habit title", () => {
    render(
      <HabitCard
        habit={HABIT}
        logs={[]}
        onCheckIn={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onShowCalendar={vi.fn()}
      />
    );
    expect(screen.getByText("Morning run")).toBeInTheDocument();
  });

  it("renders emoji when present", () => {
    render(
      <HabitCard
        habit={HABIT_WITH_EMOJI}
        logs={[]}
        onCheckIn={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onShowCalendar={vi.fn()}
      />
    );
    expect(screen.getByText("🏃")).toBeInTheDocument();
  });

  it("shows streak when habits completed yesterday", () => {
    const logs = [log("h1", "2026-05-18")];
    render(
      <HabitCard
        habit={HABIT}
        logs={logs}
        onCheckIn={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onShowCalendar={vi.fn()}
      />
    );
    // Streak should be 1 (yesterday done, today not yet)
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("calls onCheckIn when check button is clicked and not done", () => {
    const onCheckIn = vi.fn();
    render(
      <HabitCard
        habit={HABIT}
        logs={[]}
        onCheckIn={onCheckIn}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onShowCalendar={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText("habit.done"));
    expect(onCheckIn).toHaveBeenCalledOnce();
  });

  it("renders a non-interactive check indicator (not a button) when done today", () => {
    const onCheckIn = vi.fn();
    const logs = [log("h1", TODAY)];
    render(
      <HabitCard
        habit={HABIT}
        logs={logs}
        onCheckIn={onCheckIn}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onShowCalendar={vi.fn()}
      />
    );
    // The interactive check button is absent when done
    expect(screen.queryByLabelText("habit.done")).not.toBeInTheDocument();
    // Clicking the title should not invoke onCheckIn
    fireEvent.click(screen.getByText("Morning run"));
    expect(onCheckIn).not.toHaveBeenCalled();
  });

  it("shows completed badge when done today", () => {
    const logs = [log("h1", TODAY)];
    render(
      <HabitCard
        habit={HABIT}
        logs={logs}
        onCheckIn={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onShowCalendar={vi.fn()}
      />
    );
    expect(screen.getByText("habit.checkin.already")).toBeInTheDocument();
  });

  it("applies strikethrough style to title when done today", () => {
    const logs = [log("h1", TODAY)];
    render(
      <HabitCard
        habit={HABIT}
        logs={logs}
        onCheckIn={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onShowCalendar={vi.fn()}
      />
    );
    const title = screen.getByText("Morning run");
    expect(title.className).toMatch(/line-through/);
  });

  it("calls onEdit when Edit menu item is clicked", () => {
    const onEdit = vi.fn();
    render(
      <HabitCard
        habit={HABIT}
        logs={[]}
        onCheckIn={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onShowCalendar={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText("habit.menu.open"));
    fireEvent.click(screen.getByText("habit.menu.edit"));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("calls onDelete when Delete menu item is clicked", () => {
    const onDelete = vi.fn();
    render(
      <HabitCard
        habit={HABIT}
        logs={[]}
        onCheckIn={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onShowCalendar={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText("habit.menu.open"));
    fireEvent.click(screen.getByText("habit.menu.delete"));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("closes menu when clicking outside", () => {
    render(
      <HabitCard
        habit={HABIT}
        logs={[]}
        onCheckIn={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onShowCalendar={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText("habit.menu.open"));
    expect(screen.getByText("habit.menu.edit")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("habit.menu.edit")).not.toBeInTheDocument();
  });
});
