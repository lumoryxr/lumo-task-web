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

  it("opens a solar event on the Solar calendar with the date input", () => {
    render(<CountdownFormModal event={EDIT_EVENT} onSave={vi.fn()} onClose={vi.fn()} />);
    const solarTab = screen.getByRole("radio", { name: "countdown.cal.solar" });
    expect(solarTab.getAttribute("aria-checked")).toBe("true");
    // native date input present, lunar selects absent
    expect(document.querySelector('input[type="date"]')).toBeTruthy();
    expect(screen.queryByLabelText("countdown.form.lunar.year")).toBeNull();
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

// Lunar event: solar anchor 2026-06-15 == 农历 2026 五月初一.
const LUNAR_EVENT: CountdownEvent = {
  id: "cd2",
  title: "Lunar Birthday",
  date: "2026-06-15",
  emoji: "🎂",
  color: "green",
  repeat: "yearly",
  calendar: "lunar",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("CountdownFormModal (lunar)", () => {
  it("switching to Lunar reveals the year/month/day picker and hides the date input", async () => {
    render(<CountdownFormModal onSave={vi.fn()} onClose={vi.fn()} />);
    expect(document.querySelector('input[type="date"]')).toBeTruthy();

    await userEvent.click(screen.getByRole("radio", { name: "countdown.cal.lunar" }));

    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(screen.getByLabelText("countdown.form.lunar.year")).toBeTruthy();
    expect(screen.getByLabelText("countdown.form.lunar.month")).toBeTruthy();
    expect(screen.getByLabelText("countdown.form.lunar.day")).toBeTruthy();
  });

  it("saves a lunar event with calendar='lunar' and a solar ISO anchor", async () => {
    const onSave = vi.fn();
    render(<CountdownFormModal onSave={onSave} onClose={vi.fn()} />);
    const titleInput = screen.getByPlaceholderText("新年快乐、我的生日…");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Lunar New Year");
    await userEvent.click(screen.getByRole("radio", { name: "countdown.cal.lunar" }));
    fireEvent.click(screen.getByText("countdown.form.create"));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Lunar New Year",
          calendar: "lunar",
          date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      );
    });
  });

  it("pre-fills the picker from a lunar event's solar anchor when editing", () => {
    render(<CountdownFormModal event={LUNAR_EVENT} onSave={vi.fn()} onClose={vi.fn()} />);
    const lunarTab = screen.getByRole("radio", { name: "countdown.cal.lunar" });
    expect(lunarTab.getAttribute("aria-checked")).toBe("true");
    const year = screen.getByLabelText("countdown.form.lunar.year") as HTMLSelectElement;
    const month = screen.getByLabelText("countdown.form.lunar.month") as HTMLSelectElement;
    const day = screen.getByLabelText("countdown.form.lunar.day") as HTMLSelectElement;
    expect(year.value).toBe("2026");
    expect(month.value).toBe("5:0"); // 五月, regular (non-leap)
    expect(day.value).toBe("1"); // 初一
  });

  it("changing the lunar day updates the stored solar anchor and round-trips", async () => {
    const onSave = vi.fn();
    render(<CountdownFormModal event={LUNAR_EVENT} onSave={onSave} onClose={vi.fn()} />);
    const day = screen.getByLabelText("countdown.form.lunar.day") as HTMLSelectElement;
    // 五月初一 → 五月初二 ; solar anchor must shift by one day (2026-06-15 → 2026-06-16)
    await userEvent.selectOptions(day, "2");
    fireEvent.click(screen.getByText("countdown.form.save"));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ calendar: "lunar", date: "2026-06-16" }),
      );
    });
  });

  it("switching back to Solar restores the date input and keeps the anchor", async () => {
    render(<CountdownFormModal event={LUNAR_EVENT} onSave={vi.fn()} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: "countdown.cal.solar" }));
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).toBeTruthy();
    expect(dateInput.value).toBe("2026-06-15");
  });
});
