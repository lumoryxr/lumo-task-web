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

  it("joins up to two names and collapses the rest into +N", () => {
    render(<AssigneeChip people={[ALICE, BOB, CAROL]} />);
    expect(screen.getByText("Alice Wonderland, Bob")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("honors a smaller maxNames for compact surfaces", () => {
    render(<AssigneeChip people={[ALICE, BOB]} maxNames={1} />);
    expect(screen.getByText("Alice Wonderland")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.queryByText(/Bob/)).toBeNull();
  });

  it("exposes every assignee's full name via tooltip and accessible label", () => {
    render(<AssigneeChip people={[ALICE, BOB, CAROL]} />);
    const chip = screen.getByLabelText("Assigned to Alice Wonderland, Bob, Carol");
    expect(chip).toHaveAttribute("title", "Assigned to Alice Wonderland, Bob, Carol");
  });

  it("truncates the names instead of growing past its max width", () => {
    render(<AssigneeChip people={[ALICE]} />);
    expect(screen.getByText("Alice Wonderland")).toHaveClass("truncate");
  });

  it("uses the Chinese list separator in zh", () => {
    mockAppState.locale = "zh";
    render(<AssigneeChip people={[ALICE, BOB]} />);
    expect(screen.getByText("Alice Wonderland、Bob")).toBeInTheDocument();
    expect(screen.getByLabelText("责任人：Alice Wonderland、Bob")).toBeInTheDocument();
    mockAppState.locale = "en";
  });
});
