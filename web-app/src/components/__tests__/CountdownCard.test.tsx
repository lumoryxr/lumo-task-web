import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CountdownCard } from "../CountdownCard";
import type { CountdownEvent } from "@/types/task";

// i18n stub
vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));

afterEach(() => vi.useRealTimers());

const BASE: CountdownEvent = {
  id: "cd1",
  title: "My Birthday",
  date: "2026-08-14",
  emoji: "🎂",
  color: "amber",
  repeat: "yearly",
  calendar: "solar",
  createdAt: "2026-01-01T00:00:00Z",
};

function setup(overrides: Partial<CountdownEvent> = {}) {
  const ev = { ...BASE, ...overrides };
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(<CountdownCard event={ev} locale="en" onEdit={onEdit} onDelete={onDelete} />);
  return { onEdit, onDelete };
}

describe("CountdownCard", () => {
  it("renders the event title", () => {
    setup();
    expect(screen.getByText("My Birthday")).toBeTruthy();
  });

  it("renders the emoji", () => {
    setup();
    expect(screen.getByText("🎂")).toBeTruthy();
  });

  it("renders fallback emoji when none provided", () => {
    setup({ emoji: undefined });
    expect(screen.getByText("📅")).toBeTruthy();
  });

  it("renders note when present", () => {
    setup({ note: "A personal milestone" });
    expect(screen.getByText("A personal milestone")).toBeTruthy();
  });

  it("calls onEdit when Edit menu item is clicked", () => {
    const { onEdit } = setup();
    // Open menu
    const menuBtn = screen.getByRole("button", { name: "" });
    fireEvent.click(menuBtn);
    // Click edit
    const editBtn = screen.getByText("countdown.menu.edit");
    fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "cd1" }));
  });

  it("calls onDelete when Delete menu item is clicked", () => {
    const { onDelete } = setup();
    const menuBtn = screen.getByRole("button", { name: "" });
    fireEvent.click(menuBtn);
    const deleteBtn = screen.getByText("countdown.menu.delete");
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith("cd1");
  });

  it("closes menu when clicking outside", () => {
    setup();
    const menuBtn = screen.getByRole("button", { name: "" });
    fireEvent.click(menuBtn);
    expect(screen.getByText("countdown.menu.edit")).toBeTruthy();
    // Mousedown outside
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("countdown.menu.edit")).toBeNull();
  });

  it("shows today label when days === 0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T00:00:00"));
    setup({ repeat: "none", date: "2026-08-14" });
    expect(screen.getAllByText("countdown.today").length).toBeGreaterThan(0);
  });

  it("shows yearly repeat badge", () => {
    setup({ repeat: "yearly" });
    expect(screen.getByText("countdown.repeat.yearly")).toBeTruthy();
  });

  it("does not show repeat badge for one-time events", () => {
    setup({ repeat: "none" });
    expect(screen.queryByText("countdown.repeat.yearly")).toBeNull();
  });
});
