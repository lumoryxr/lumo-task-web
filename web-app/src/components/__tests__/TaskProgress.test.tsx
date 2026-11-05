import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskProgressBar, TaskProgressEditor } from "../TaskProgress";

vi.mock("@/store/useAppStore", () => {
  const useAppStore: any = (sel: any) => sel({ locale: "en" });
  useAppStore.getState = () => ({ locale: "en" });
  return { useAppStore };
});

const sub = (completed: boolean, i: number) => ({ id: `s${i}`, title: `step ${i}`, completed });

describe("TaskProgressBar", () => {
  it("shows the percentage and exposes it as an accessible progressbar", () => {
    render(<TaskProgressBar value={60} />);
    const bar = screen.getByRole("progressbar", { name: "Progress 60%" });
    expect(bar).toHaveAttribute("aria-valuenow", "60");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("clamps an out-of-range value", () => {
    render(<TaskProgressBar value={140} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("marks a finished task as complete", () => {
    render(<TaskProgressBar value={100} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("data-complete", "true");
  });

  it("can hide its text label", () => {
    render(<TaskProgressBar value={40} showLabel={false} />);
    expect(screen.queryByText("40%")).toBeNull();
  });
});

describe("TaskProgressEditor", () => {
  it("shows the current value", () => {
    render(<TaskProgressEditor value={45} onChange={() => {}} />);
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Progress" })).toHaveValue("45");
  });

  it("reports live slider changes through onChange", () => {
    const onChange = vi.fn();
    render(<TaskProgressEditor value={10} onChange={onChange} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "55" } });
    expect(onChange).toHaveBeenCalledWith(55);
  });

  it("commits once the slider is released, not on every move", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<TaskProgressEditor value={10} onChange={() => {}} onCommit={onCommit} />);
    rerender(<TaskProgressEditor value={70} onChange={() => {}} onCommit={onCommit} />);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(screen.getByRole("slider"));
    expect(onCommit).toHaveBeenCalledWith(70);
  });

  it("commits after a keyboard adjustment", () => {
    const onCommit = vi.fn();
    render(<TaskProgressEditor value={30} onChange={() => {}} onCommit={onCommit} />);
    fireEvent.keyUp(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onCommit).toHaveBeenCalledWith(30);
  });

  it("does not commit on keys that cannot change the value", () => {
    const onCommit = vi.fn();
    render(<TaskProgressEditor value={30} onChange={() => {}} onCommit={onCommit} />);
    fireEvent.keyUp(screen.getByRole("slider"), { key: "Tab" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("presets set and commit a value in one click, and show which one is active", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<TaskProgressEditor value={50} onChange={onChange} onCommit={onCommit} />);
    expect(screen.getByRole("button", { name: "Set progress to 50%" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Set progress to 75%" }));
    expect(onChange).toHaveBeenCalledWith(75);
    expect(onCommit).toHaveBeenCalledWith(75);
  });

  it("offers to match the subtask completion when it differs", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <TaskProgressEditor
        value={10}
        onChange={onChange}
        onCommit={onCommit}
        subtasks={[true, true, false, false].map(sub)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Match subtasks (50%)" }));
    expect(onChange).toHaveBeenCalledWith(50);
    expect(onCommit).toHaveBeenCalledWith(50);
  });

  it("hides the subtask shortcut when there are no subtasks or it already matches", () => {
    const { rerender } = render(<TaskProgressEditor value={50} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /Match subtasks/ })).toBeNull();
    rerender(<TaskProgressEditor value={50} onChange={() => {}} subtasks={[true, false].map(sub)} />);
    expect(screen.queryByRole("button", { name: /Match subtasks/ })).toBeNull();
  });

  it("disables input and shows a saving state while busy", () => {
    render(<TaskProgressEditor value={20} onChange={() => {}} onCommit={() => {}} busy />);
    expect(screen.getByRole("slider")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Set progress to 75%" })).toBeDisabled();
    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });
});
