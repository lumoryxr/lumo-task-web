import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuadrantPicker } from "../QuadrantPicker";
import { DuePicker } from "../DuePicker";
import { DurationStepper } from "../DurationStepper";
import { RecurrencePicker } from "../RecurrencePicker";
import { toISODate } from "@/lib/format";
import type { Quadrant, TaskRecurrence } from "@/types/task";

vi.mock("@/store/useAppStore", () => {
  const useAppStore = Object.assign(
    (sel: (s: { locale: "en" }) => unknown) => sel({ locale: "en" }),
    { getState: () => ({ locale: "en" as const }) },
  );
  return { useAppStore };
});

function Quad() {
  const [q, setQ] = useState<Quadrant>("Q2");
  return <><QuadrantPicker value={q} onChange={setQ} /><output>{q}</output></>;
}

function Due({ initial = "" }: { initial?: string }) {
  const [d, setD] = useState(initial);
  return <><DuePicker value={d} onChange={setD} /><output data-testid="due">{d}</output></>;
}

function Dur() {
  const [m, setM] = useState(30);
  return <><DurationStepper value={m} onChange={setM} /><output data-testid="dur">{m}</output></>;
}

function Rec() {
  const [r, setR] = useState<TaskRecurrence>("none");
  return <><RecurrencePicker value={r} onChange={setR} /><output data-testid="rec">{r}</output></>;
}

describe("task form pieces", () => {
  it("QuadrantPicker: one compact row, one choice pressed", () => {
    render(<Quad />);
    const group = screen.getByRole("group", { name: "Quadrant" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Q2/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^Q1/ }));
    expect(screen.getByRole("button", { name: /^Q1/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Q2/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("DuePicker: quick picks, a date field, and clear", () => {
    render(<Due />);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByTestId("due").textContent).toBe(toISODate(new Date()));
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "2030-01-02" } });
    expect(screen.getByTestId("due").textContent).toBe("2030-01-02");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByTestId("due").textContent).toBe("");
  });

  it("DurationStepper: − / + and typing, never below 1", () => {
    render(<Dur />);
    fireEvent.click(screen.getByRole("button", { name: "More time" }));
    expect(screen.getByTestId("dur").textContent).toBe("35");
    fireEvent.click(screen.getByRole("button", { name: "Less time" }));
    expect(screen.getByTestId("dur").textContent).toBe("30");
    const input = screen.getByLabelText("Estimate");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(screen.getByTestId("dur").textContent).toBe("1");
  });

  it("RecurrencePicker: one choice pressed", () => {
    render(<Rec />);
    fireEvent.click(screen.getByRole("button", { name: "Weekly" }));
    expect(screen.getByTestId("rec").textContent).toBe("weekly");
    expect(screen.getByRole("button", { name: "Weekly" })).toHaveAttribute("aria-pressed", "true");
  });
});
