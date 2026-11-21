import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuadrantBreakdown } from "../QuadrantBreakdown";
import { quadrantCallout, type QuadrantCount } from "@/utils/stats";

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));

function makeBreakdown(overrides: Partial<Record<string, number>> = {}): QuadrantCount[] {
  const counts: Record<string, number> = {
    Q1: 0, Q2: 0, Q3: 0, Q4: 0, unclassified: 0, ...overrides,
  };
  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  return (["Q1", "Q2", "Q3", "Q4", "unclassified"] as const).map((q) => ({
    quadrant: q,
    count: counts[q],
    percent: total > 0 ? Math.round((counts[q] / total) * 100) : 0,
  }));
}

describe("QuadrantBreakdown", () => {
  it("names every quadrant with its count, and a dash where there is none", () => {
    render(<QuadrantBreakdown breakdown={makeBreakdown({ Q1: 3, Q2: 1 })} />);
    expect(screen.getByText("Q1 · matrix.q1")).toBeInTheDocument();
    expect(screen.getByText("Q4 · matrix.q4")).toBeInTheDocument();
    expect(screen.getByText("stats.quadrant.unclassified")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("draws one block per quadrant that has work, sized by its share, printing the share", () => {
    const { container } = render(<QuadrantBreakdown breakdown={makeBreakdown({ Q1: 3, Q2: 1 })} />);
    const blocks = container.querySelectorAll("[data-quadrant]");
    expect(blocks).toHaveLength(2);
    expect((blocks[0] as HTMLElement).style.width).toBe("75%");
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName("Q1 · matrix.q1 3 (75%), Q2 · matrix.q2 1 (25%)");
  });

  it("does not show a callout when there are fewer than 5 tasks", () => {
    render(<QuadrantBreakdown breakdown={makeBreakdown({ Q2: 4 })} />);
    expect(screen.queryByText(/stats\.quadrant\.callout/)).not.toBeInTheDocument();
  });

  it("shows the reading of the split", () => {
    render(<QuadrantBreakdown breakdown={makeBreakdown({ Q1: 3, Q2: 3, Q3: 1, Q4: 1, unclassified: 2 })} />);
    expect(screen.getByText("stats.quadrant.callout.q2good")).toBeInTheDocument();
  });
});

describe("quadrantCallout", () => {
  it("praises a healthy share of Q2 work", () => {
    expect(quadrantCallout(makeBreakdown({ Q1: 3, Q2: 3, Q3: 1, Q4: 1, unclassified: 2 }))).toEqual({
      key: "stats.quadrant.callout.q2good",
      pct: 30,
    });
  });

  it("flags a Q1-heavy period", () => {
    expect(quadrantCallout(makeBreakdown({ Q1: 6, Q3: 2, Q4: 2 }))?.key).toBe("stats.quadrant.callout.q1heavy");
  });

  it("flags a lot of Q3/Q4 work", () => {
    expect(quadrantCallout(makeBreakdown({ Q1: 3, Q3: 3, Q4: 4 }))).toEqual({
      key: "stats.quadrant.callout.q3q4high",
      pct: 70,
    });
  });

  it("says nothing for too little data", () => {
    expect(quadrantCallout(makeBreakdown({ Q2: 4 }))).toBeNull();
  });
});
