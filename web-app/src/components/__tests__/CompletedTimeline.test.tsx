import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompletedTimeline } from "../CompletedTimeline";
import type { CompletedEntry } from "@/types/task";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Resolve t() against the real catalog so the format/plural assertions stay
// meaningful. `tLocale` is set per test (the component takes locale as a prop
// for fmtTime/fmtDuration, but useT reads the app locale separately).
const h = vi.hoisted(() => ({ locale: "en" as "en" | "zh" }));
vi.mock("@/i18n/useT", async () => {
  const actual = await vi.importActual<typeof import("@/i18n/strings")>("@/i18n/strings");
  return {
    useT: () => (key: string) => actual.STRINGS[h.locale][key] ?? key,
    useLocaleString: () => (v: unknown) => {
      if (v && typeof v === "object" && "en" in v) return (v as { en: string }).en;
      return String(v ?? "");
    },
  };
});

const mockReopen = vi.fn();
vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: (s: { reopen: typeof mockReopen }) => unknown) =>
    sel({ reopen: mockReopen }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function isoToday(h: number, m: number) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const ENTRY_1: CompletedEntry = {
  id: "c1",
  title: { en: "Reply to design feedback", zh: "回复设计反馈" },
  duration: 18,
  quadrant: "Q2",
  startedAt: isoToday(8, 55),
  completedAt: isoToday(9, 13),
};

const ENTRY_2: CompletedEntry = {
  id: "c2",
  title: { en: "Review pull request #47", zh: "Review PR #47" },
  duration: 25,
  quadrant: "Q1",
  startedAt: isoToday(10, 5),
  completedAt: isoToday(10, 30),
};

const ENTRY_NO_TIME: CompletedEntry = {
  id: "c3",
  title: { en: "Quick task", zh: "快速任务" },
  duration: 5,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CompletedTimeline", () => {
  beforeEach(() => {
    mockReopen.mockReset();
    h.locale = "en";
  });

  it("renders section header with entry count and total time (en)", () => {
    render(<CompletedTimeline entries={[ENTRY_1, ENTRY_2]} locale="en" />);
    expect(screen.getByText("Completed today")).toBeInTheDocument();
    expect(screen.getByText("2 tasks")).toBeInTheDocument();
    expect(screen.getByText("43 min total")).toBeInTheDocument();
  });

  it("renders section header with entry count and total time (zh)", () => {
    h.locale = "zh";
    render(<CompletedTimeline entries={[ENTRY_1]} locale="zh" />);
    expect(screen.getByText("今日已完成")).toBeInTheDocument();
    expect(screen.getByText("1 项")).toBeInTheDocument();
    expect(screen.getByText("共 18 分钟")).toBeInTheDocument();
  });

  it("formats hours+minutes correctly when total >= 60 (en)", () => {
    const long: CompletedEntry = { ...ENTRY_1, duration: 90 };
    render(<CompletedTimeline entries={[long]} locale="en" />);
    expect(screen.getByText("1h 30m total")).toBeInTheDocument();
  });

  it("formats hours+minutes correctly when total >= 60 (zh)", () => {
    h.locale = "zh";
    const long: CompletedEntry = { ...ENTRY_1, duration: 90 };
    render(<CompletedTimeline entries={[long]} locale="zh" />);
    expect(screen.getByText("共 1 小时 30 分")).toBeInTheDocument();
  });

  it("renders task titles in English locale", () => {
    render(<CompletedTimeline entries={[ENTRY_1, ENTRY_2]} locale="en" />);
    expect(screen.getByText("Reply to design feedback")).toBeInTheDocument();
    expect(screen.getByText("Review pull request #47")).toBeInTheDocument();
  });

  it("renders reopen buttons for each entry", () => {
    render(<CompletedTimeline entries={[ENTRY_1, ENTRY_2]} locale="en" />);
    const reopenBtns = screen.getAllByTitle("Reopen");
    expect(reopenBtns).toHaveLength(2);
  });

  it("calls reopen with correct entry id when button clicked", () => {
    mockReopen.mockResolvedValue(undefined);
    render(<CompletedTimeline entries={[ENTRY_1, ENTRY_2]} locale="en" />);
    const reopenBtns = screen.getAllByTitle("Reopen");
    fireEvent.click(reopenBtns[0]);
    expect(mockReopen).toHaveBeenCalledWith("c1");
  });

  it("renders quadrant chip when quadrant is set", () => {
    render(<CompletedTimeline entries={[ENTRY_1]} locale="en" />);
    expect(screen.getByText("Q2")).toBeInTheDocument();
  });

  it("renders duration label for each entry", () => {
    render(<CompletedTimeline entries={[ENTRY_1]} locale="en" />);
    expect(screen.getByText("18m")).toBeInTheDocument();
  });

  it("sorts entries by completedAt ascending", () => {
    // ENTRY_2 completes at 10:30, ENTRY_1 at 9:13 — render in reversed order to test sort
    render(<CompletedTimeline entries={[ENTRY_2, ENTRY_1]} locale="en" />);
    const titles = screen.getAllByText(/Reply to|Review pull/);
    // ENTRY_1 (9:13) should appear before ENTRY_2 (10:30)
    expect(titles[0].textContent).toContain("Reply to");
    expect(titles[1].textContent).toContain("Review pull");
  });

  it("renders entry without time labels when startedAt/completedAt are absent", () => {
    render(<CompletedTimeline entries={[ENTRY_NO_TIME]} locale="en" />);
    expect(screen.getByText("Quick task")).toBeInTheDocument();
    // No time columns rendered (no ISO strings to format)
    expect(screen.queryByText(/\d{2}:\d{2}/)).toBeNull();
  });

  it("shows singular 'task' for a single entry (en)", () => {
    render(<CompletedTimeline entries={[ENTRY_1]} locale="en" />);
    expect(screen.getByText("1 task")).toBeInTheDocument();
  });

  it("applies timeline-entry and group classes to each row", () => {
    const { container } = render(<CompletedTimeline entries={[ENTRY_1, ENTRY_2]} locale="en" />);
    const rows = container.querySelectorAll(".timeline-entry.group");
    expect(rows).toHaveLength(2);
  });

  it("last entry has no connector node", () => {
    const { container } = render(<CompletedTimeline entries={[ENTRY_1, ENTRY_2]} locale="en" />);
    const connectors = container.querySelectorAll(".timeline-node-connector");
    // Only ENTRY_1 has a connector (not the last)
    expect(connectors).toHaveLength(1);
  });
});
