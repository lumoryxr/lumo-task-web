import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TodayHero, greetingPeriod } from "../TodayHero";

// Locale drives useT (real dictionary lookup) + the date/separator branch.
vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: any) => sel({ locale: "en" }),
}));

describe("greetingPeriod", () => {
  it("buckets the hour into morning / afternoon / evening", () => {
    expect(greetingPeriod(0)).toBe("morning");
    expect(greetingPeriod(11)).toBe("morning");
    expect(greetingPeriod(12)).toBe("afternoon");
    expect(greetingPeriod(17)).toBe("afternoon");
    expect(greetingPeriod(18)).toBe("evening");
    expect(greetingPeriod(23)).toBe("evening");
  });
});

describe("TodayHero", () => {
  it("shows the completion ring + subline when there is a workload", () => {
    render(<TodayHero name="Jalen" done={3} total={4} />);
    expect(screen.getByText("3 of 4 done today")).toBeInTheDocument();
    // 3/4 → 75%, shown both as the label and the ring's accessible name.
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "75%" })).toBeInTheDocument();
    // Greeting line carries the name.
    expect(screen.getByRole("heading")).toHaveTextContent("Jalen");
  });

  it("shows the empty-day line and hides the ring when there is no workload", () => {
    render(<TodayHero done={0} total={0} />);
    expect(screen.getByText("A fresh day — plan your focus.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
