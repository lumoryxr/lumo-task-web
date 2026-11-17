import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StageTrack } from "../StageTrack";

vi.mock("@/store/useAppStore", () => {
  const useAppStore: any = (sel: any) => sel({ locale: "en" });
  useAppStore.getState = () => ({ locale: "en" });
  return { useAppStore };
});

const STAGES = [
  { id: "plan", name: "Plan" },
  { id: "build", name: "Build" },
  { id: "review", name: "Review" },
  { id: "ship", name: "Ship" },
];

describe("StageTrack (full)", () => {
  it("shows every stage in order", () => {
    render(<StageTrack stages={STAGES} currentId="build" />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Plan")]),
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("marks stages before the current one done, the current one current, the rest upcoming", () => {
    render(<StageTrack stages={STAGES} currentId="build" />);
    const states = screen.getAllByRole("listitem").map((li) => li.getAttribute("data-state"));
    expect(states).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Build");
  });

  it("with no current stage, every stage is upcoming", () => {
    render(<StageTrack stages={STAGES} currentId={null} />);
    expect(screen.getAllByRole("listitem").every((li) => li.getAttribute("data-state") === "upcoming")).toBe(true);
  });

  it("treats an unknown current id as no stage", () => {
    render(<StageTrack stages={STAGES} currentId="gone" />);
    expect(screen.queryByRole("listitem", { current: "step" })).toBeNull();
  });

  it("lets the user pick a stage when interactive", () => {
    const onSelect = vi.fn();
    render(<StageTrack stages={STAGES} currentId="plan" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Set stage to Review" }));
    expect(onSelect).toHaveBeenCalledWith("review");
  });

  it("does not re-select the stage that is already current", () => {
    const onSelect = vi.fn();
    render(<StageTrack stages={STAGES} currentId="plan" onSelect={onSelect} />);
    const current = screen.getByRole("button", { name: "Current stage: Plan" });
    expect(current).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(current);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("is read-only without onSelect, and disabled while busy", () => {
    const { rerender } = render(<StageTrack stages={STAGES} currentId="plan" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    rerender(<StageTrack stages={STAGES} currentId="plan" onSelect={() => {}} busy />);
    expect(screen.getByRole("button", { name: "Set stage to Build" })).toBeDisabled();
  });

  it("can show a count under each stage", () => {
    render(<StageTrack stages={STAGES} currentId={null} counts={{ build: 3 }} />);
    expect(screen.getByText("3 tasks")).toBeInTheDocument();
    expect(screen.getAllByText("0 tasks")).toHaveLength(3);
  });
});

describe("StageTrack (compact)", () => {
  it("shows one segment per stage and the current stage's name and position", () => {
    render(<StageTrack variant="compact" stages={STAGES} currentId="review" />);
    const track = screen.getByRole("img", { name: "Stage Review, 3 of 4" });
    expect(track.querySelectorAll("[data-segment]")).toHaveLength(4);
    expect(
      Array.from(track.querySelectorAll("[data-segment]")).map((s) => s.getAttribute("data-state")),
    ).toEqual(["done", "done", "current", "upcoming"]);
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
  });

  it("lists every stage in its tooltip", () => {
    render(<StageTrack variant="compact" stages={STAGES} currentId="plan" />);
    expect(screen.getByRole("img").getAttribute("title")).toBe("Plan → Build → Review → Ship");
  });

  it("renders nothing without a current stage", () => {
    const { container } = render(<StageTrack variant="compact" stages={STAGES} currentId={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
