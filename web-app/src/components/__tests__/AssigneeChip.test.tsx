import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssigneeChip } from "../AssigneeChip";

const mockAppState = { locale: "en" as "en" | "zh" };
vi.mock("@/store/useAppStore", () => {
  const useAppStore: any = (sel: any) => sel({ locale: mockAppState.locale });
  useAppStore.getState = () => ({ locale: mockAppState.locale });
  return { useAppStore };
});

const p = (id: string, name: string) => ({
  id,
  name,
  initials: name.slice(0, 2).toUpperCase(),
  color: "var(--accent-primary)",
});

const ALICE = p("p1", "Alice Wonderland");
const BOB = p("p2", "Bob");
const CAROL = p("p3", "Carol");

describe("AssigneeChip", () => {
  it("renders nothing when there are no assignees", () => {
    const { container } = render(<AssigneeChip people={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the full name of a single assignee next to their avatar", () => {
    render(<AssigneeChip people={[ALICE]} />);
    expect(screen.getByText("Alice Wonderland")).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("shows only the primary assignee (the first) and counts the rest as +N", () => {
    render(<AssigneeChip people={[ALICE, BOB, CAROL]} />);
    expect(screen.getByText("Alice Wonderland")).toBeInTheDocument();
    expect(screen.queryByText(/Bob/)).toBeNull();
    expect(screen.queryByText(/Carol/)).toBeNull();
    expect(screen.getByText("+2")).toBeInTheDocument();
    // Only the primary's avatar: the others are for the task's details.
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.queryByText("BO")).toBeNull();
  });

  it("labels the primary assignee, and how many others there are", () => {
    render(<AssigneeChip people={[ALICE, BOB, CAROL]} />);
    const chip = screen.getByLabelText("Owner: Alice Wonderland (+2 more)");
    expect(chip).toHaveAttribute("title", "Owner: Alice Wonderland (+2 more)");
  });

  it("labels a lone primary assignee without a count", () => {
    render(<AssigneeChip people={[ALICE]} />);
    expect(screen.getByLabelText("Owner: Alice Wonderland")).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it("truncates the names instead of growing past its max width", () => {
    render(<AssigneeChip people={[ALICE]} />);
    expect(screen.getByText("Alice Wonderland")).toHaveClass("truncate");
  });

  it("speaks Chinese in zh", () => {
    mockAppState.locale = "zh";
    render(<AssigneeChip people={[ALICE, BOB]} />);
    expect(screen.getByLabelText("主责任人：Alice Wonderland（另有 1 人）")).toBeInTheDocument();
    mockAppState.locale = "en";
  });
});
