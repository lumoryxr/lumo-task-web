import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { StatTile } from "../StatTile";
import { DailyChart } from "../DailyChart";
import { HourHeatmap } from "../HourHeatmap";
import { RankedList } from "../RankedList";
import { Highlights } from "../Highlights";

vi.mock("@/i18n/useT", () => ({ useT: () => (key: string) => key }));

describe("StatTile", () => {
  it("shows the figure with its change in words and an arrow, not colour alone", () => {
    render(<StatTile icon={null} label="Tasks" value="12" delta={20} rangeDays={7} trend={[1, 2, 3]} />);
    const tile = screen.getByRole("group", { name: "Tasks" });
    expect(tile).toHaveTextContent("12");
    expect(tile).toHaveTextContent("▲stats.delta.up");
    expect(tile).toHaveTextContent("stats.delta.vs");
  });

  it("marks a drop with a down arrow and says when there is nothing to compare", () => {
    const { rerender } = render(<StatTile icon={null} label="Focus" value="3" delta={-40} rangeDays={7} />);
    expect(screen.getByRole("group", { name: "Focus" })).toHaveTextContent("▼stats.delta.down");
    rerender(<StatTile icon={null} label="Focus" value="3" delta={null} rangeDays={7} />);
    expect(screen.getByRole("group", { name: "Focus" })).toHaveTextContent("stats.delta.new");
  });
});

describe("DailyChart", () => {
  const points = [
    { date: "2026-11-19", count: 2, minutes: 50 },
    { date: "2026-11-20", count: 0, minutes: 0 },
    { date: "2026-11-21", count: 5, minutes: 120 },
  ];

  it("draws a column per day with work and keeps every value in a table", () => {
    const { container } = render(<DailyChart points={points} locale="en" />);
    const rows = within(container.querySelector("table") as HTMLElement).getAllByRole("row");
    expect(rows).toHaveLength(4); // header + 3 days
    expect(rows[3]).toHaveTextContent("2026-11-215120");
  });

  it("reads out a day on keyboard focus and moves with the arrow keys", () => {
    render(<DailyChart points={points} locale="en" />);
    const chart = screen.getByRole("img", { name: "stats.trend.aria" });
    fireEvent.focus(chart);
    expect(screen.getByRole("status")).toHaveTextContent("stats.trend.tasks");
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("Thu");
    fireEvent.blur(chart);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("HourHeatmap", () => {
  it("names the hovered cell's weekday, hour and count", () => {
    const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
    heat[1][10] = 3;
    render(<HourHeatmap heat={heat} max={3} />);
    const grid = screen.getByRole("img", { name: "stats.heat.sub" });
    fireEvent.focus(grid); // starts at Monday 09:00
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(screen.getByText("stats.heat.cell")).toBeInTheDocument();
  });
});

describe("RankedList", () => {
  it("ranks items with their figure, and explains an empty list", () => {
    const { rerender } = render(
      <RankedList items={[{ key: "a", label: "Alpha", count: 4 }, { key: "b", label: "Beta", count: 1 }]} empty="none" />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("1Alpha4");
    expect(items[1]).toHaveTextContent("2Beta1");
    rerender(<RankedList items={[]} empty="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});

describe("Highlights", () => {
  it("lists one sentence per highlight", () => {
    render(<Highlights items={[{ key: "a", icon: null, text: "Best day: Tue" }]} empty="none" />);
    expect(screen.getByRole("listitem")).toHaveTextContent("Best day: Tue");
  });
});
