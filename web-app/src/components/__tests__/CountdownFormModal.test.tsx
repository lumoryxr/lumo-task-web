import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CountdownFormModal } from "../CountdownFormModal";
import type { CountdownEvent } from "@/types/task";

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));

const EDIT_EVENT: CountdownEvent = {
  id: "cd1",
  title: "My Birthday",
  date: "2026-08-14",
  emoji: "🎂",
  color: "amber",
  repeat: "yearly",
  note: "Special day",
  calendar: "solar",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("CountdownFormModal (create)", () => {
  it("renders the new event heading", () => {
    render(<CountdownFormModal onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("countdown.form.new")).toBeTruthy();
  });

  it("shows validation error when submitting empty title", async () => {
    render(<CountdownFormModal onSave={vi.fn()} onClose={vi.fn()} />);
    // Clear any default value and submit
    const titleInput = screen.getByPlaceholderText("新年快乐、我的生日…");
    await userEvent.clear(titleInput);
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => {
      expect(screen.getByText("countdown.form.error.title")).toBeTruthy();
    });
  });

  it("calls onSave with correct values when form is valid", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<CountdownFormModal onSave={onSave} onClose={onClose} />);
    const titleInput = screen.getByPlaceholderText("新年快乐、我的生日…");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "New Year");
    // submit
    const submitBtn = screen.getByText("countdown.form.create");
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: "New Year" }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("calls onClose when cancel button is clicked", () => {
    const onClose = vi.fn();
    render(<CountdownFormModal onSave={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText("countdown.btn.cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when close (X) button is clicked", () => {
    const onClose = vi.fn();
    render(<CountdownFormModal onSave={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when pressing Escape on the modal", () => {
    const onClose = vi.fn();
    render(<CountdownFormModal onSave={vi.fn()} onClose={onClose} />);
    // The onKeyDown handler is on the inner modal container div (the white card)
    const modal = document.querySelector("[style*='bg-elevated']") ?? document.querySelector("form")!.parentElement!;
    fireEvent.keyDown(modal, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("CountdownFormModal (edit)", () => {
  it("renders the edit heading and pre-fills fields", () => {
    render(<CountdownFormModal event={EDIT_EVENT} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("countdown.form.edit")).toBeTruthy();
    const titleInput = screen.getByPlaceholderText("新年快乐、我的生日…") as HTMLInputElement;
    expect(titleInput.value).toBe("My Birthday");
  });

  it("shows save button text for edit mode", () => {
    render(<CountdownFormModal event={EDIT_EVENT} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("countdown.form.save")).toBeTruthy();
  });

  it("shows title.maxlen error when title exceeds 100 chars", async () => {
    render(<CountdownFormModal onSave={vi.fn()} onClose={vi.fn()} />);
    const titleInput = screen.getByPlaceholderText("新年快乐、我的生日…");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "a".repeat(101));
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => {
      expect(screen.getByText("countdown.form.error.title.maxlen")).toBeTruthy();
    });
  });
});
