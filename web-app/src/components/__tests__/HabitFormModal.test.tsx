import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HabitFormModal } from "../HabitFormModal";
import type { Habit } from "@/types/task";

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));

const HABIT: Habit = {
  id: "h1",
  title: "Morning run",
  emoji: "🏃",
  color: "green",
  frequency: "daily",
  note: "Before breakfast",
  createdAt: "2024-01-01T00:00:00.000Z",
};

describe("HabitFormModal (create)", () => {
  it("renders the new habit heading", () => {
    render(<HabitFormModal onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("habit.form.new")).toBeInTheDocument();
  });

  it("shows validation error when submitting empty title", () => {
    render(<HabitFormModal onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("habit.form.create"));
    expect(screen.getByText("habit.form.error.title")).toBeInTheDocument();
  });

  it("calls onSave with correct values when form is valid", () => {
    const onSave = vi.fn();
    render(<HabitFormModal onSave={onSave} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("habit.form.title"), {
      target: { value: "Read books" },
    });
    fireEvent.click(screen.getByText("habit.form.create"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Read books", frequency: "daily" })
    );
  });

  it("keeps the form open and re-enables submit if the save fails", async () => {
    // The store re-throws on failure; the modal must catch, reset busy, and NOT
    // close — so the user can retry rather than lose the edit silently.
    const onSave = vi.fn().mockRejectedValue(new Error("network"));
    const onClose = vi.fn();
    render(<HabitFormModal onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText("habit.form.title"), {
      target: { value: "Read books" },
    });
    fireEvent.click(screen.getByRole("button", { name: "habit.form.create" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "habit.form.create" })).not.toBeDisabled()
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when cancel button is clicked", () => {
    const onClose = vi.fn();
    render(<HabitFormModal onSave={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText("habit.btn.cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<HabitFormModal onSave={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("HabitFormModal (edit)", () => {
  it("pre-fills fields from habit prop", () => {
    render(<HabitFormModal habit={HABIT} onSave={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText("habit.form.title") as HTMLInputElement;
    expect(input.value).toBe("Morning run");
  });

  it("shows edit heading", () => {
    render(<HabitFormModal habit={HABIT} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("habit.form.edit")).toBeInTheDocument();
  });

  it("shows title.maxlen error when title exceeds 100 chars", () => {
    render(<HabitFormModal habit={HABIT} onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("habit.form.title"), {
      target: { value: "a".repeat(101) },
    });
    fireEvent.click(screen.getByText("habit.form.save"));
    expect(screen.getByText("habit.form.error.title.maxlen")).toBeInTheDocument();
  });
});
