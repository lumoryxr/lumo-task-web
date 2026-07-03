import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagInput, addTag, normalizeTag, matchSuggestions } from "../TagInput";

vi.mock("@/components/icons", () => ({
  IconClose: () => <span data-testid="x" />,
}));

describe("normalizeTag", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeTag("  work  ")).toBe("work");
  });
  it("clamps to 30 chars", () => {
    expect(normalizeTag("x".repeat(40))).toHaveLength(30);
  });
  it("returns empty for whitespace-only", () => {
    expect(normalizeTag("   ")).toBe("");
  });
});

describe("addTag", () => {
  it("appends a normalized tag", () => {
    expect(addTag(["a"], "  b ")).toEqual(["a", "b"]);
  });
  it("ignores empty input (returns the same array)", () => {
    const tags = ["a"];
    expect(addTag(tags, "   ")).toBe(tags);
  });
  it("rejects case-insensitive duplicates", () => {
    const tags = ["Work"];
    expect(addTag(tags, "work")).toBe(tags);
  });
  it("caps the list at 20 tags", () => {
    const full = Array.from({ length: 20 }, (_, i) => `t${i}`);
    expect(addTag(full, "extra")).toBe(full);
  });
});

describe("<TagInput />", () => {
  it("renders existing tags", () => {
    render(<TagInput tags={["alpha", "beta"]} onChange={() => {}} />);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("adds a tag on Enter", () => {
    const onChange = vi.fn();
    render(<TagInput tags={[]} onChange={onChange} inputAriaLabel="Tags" />);
    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "focus" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["focus"]);
  });

  it("adds a tag on comma", () => {
    const onChange = vi.fn();
    render(<TagInput tags={["a"]} onChange={onChange} inputAriaLabel="Tags" />);
    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "b" } });
    fireEvent.keyDown(input, { key: "," });
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("does NOT add a duplicate (case-insensitive)", () => {
    const onChange = vi.fn();
    render(<TagInput tags={["Work"]} onChange={onChange} inputAriaLabel="Tags" />);
    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "work" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes the last tag on Backspace when the field is empty", () => {
    const onChange = vi.fn();
    render(<TagInput tags={["a", "b"]} onChange={onChange} inputAriaLabel="Tags" />);
    const input = screen.getByLabelText("Tags");
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith(["a"]);
  });

  it("removes a tag via its ✕ button", () => {
    const onChange = vi.fn();
    render(<TagInput tags={["a", "b"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Remove tag a"));
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });
});

describe("matchSuggestions", () => {
  const pool = ["work", "workout", "home", "urgent"];
  it("returns [] when the draft is blank", () => {
    expect(matchSuggestions(pool, [], "  ")).toEqual([]);
  });
  it("matches case-insensitive substrings", () => {
    expect(matchSuggestions(pool, [], "WOR")).toEqual(["work", "workout"]);
  });
  it("excludes already-applied tags (case-insensitive)", () => {
    expect(matchSuggestions(pool, ["Work"], "wor")).toEqual(["workout"]);
  });
  it("caps the number of results", () => {
    const many = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    expect(matchSuggestions(many, [], "tag", 3)).toHaveLength(3);
  });
});

describe("<TagInput /> suggestions", () => {
  it("shows matching suggestions only while typing and applies one on click", () => {
    const onChange = vi.fn();
    render(
      <TagInput tags={[]} onChange={onChange} inputAriaLabel="Tags" suggestions={["work", "home"]} />
    );
    // No dropdown before typing.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "wo" } });
    expect(screen.getByRole("option", { name: "work" })).toBeInTheDocument();
    expect(screen.queryByText("home")).not.toBeInTheDocument();

    // mouseDown (before blur) applies the suggestion, not the raw draft.
    fireEvent.mouseDown(screen.getByRole("button", { name: "work" }));
    expect(onChange).toHaveBeenCalledWith(["work"]);
  });

  it("does not suggest a tag that is already applied", () => {
    render(
      <TagInput tags={["work"]} onChange={() => {}} inputAriaLabel="Tags" suggestions={["work", "workout"]} />
    );
    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "work" } });
    expect(screen.getByRole("option", { name: "workout" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "work" })).not.toBeInTheDocument();
  });
});
