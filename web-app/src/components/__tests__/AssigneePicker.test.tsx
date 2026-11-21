import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AssigneePicker } from "../AssigneePicker";


const p = (id: string, name: string) => ({ id, name, initials: name.slice(0, 1), color: "var(--accent-primary)" });
const PEOPLE = [p("a", "Ann"), p("b", "Bo"), p("c", "Cy")];

function Harness({ initial = [] as string[], onChange = vi.fn() }) {
  const [ids, setIds] = useState(initial);
  return (
    <>
      <AssigneePicker
        people={PEOPLE}
        value={ids}
        onChange={(next) => { setIds(next); onChange(next); }}
      />
      <output data-testid="value">{ids.join(",")}</output>
    </>
  );
}

const value = () => screen.getByTestId("value").textContent;
const chip = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

describe("AssigneePicker", () => {
  it("the first person picked becomes the primary assignee", () => {
    render(<Harness />);
    fireEvent.click(chip("Bo"));
    fireEvent.click(chip("Ann"));
    expect(value()).toBe("b,a");
    expect(chip("Bo")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Owner").closest("[data-person]")).toHaveAttribute("data-person", "b");
  });

  it("can make another selected person the primary", () => {
    render(<Harness initial={["a", "b", "c"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Make Cy the owner" }));
    expect(value()).toBe("c,a,b");
    // The primary itself offers no such button.
    expect(screen.queryByRole("button", { name: "Make Cy the owner" })).toBeNull();
  });

  it("removing the primary promotes the next person", () => {
    render(<Harness initial={["a", "b"]} />);
    fireEvent.click(chip("Ann"));
    expect(value()).toBe("b");
    expect(screen.getByText("Owner").closest("[data-person]")).toHaveAttribute("data-person", "b");
  });

  it("only selected, non-primary people offer the make-primary button", () => {
    render(<Harness initial={["a", "b"]} />);
    const group = screen.getByRole("group", { name: "Assignees" });
    expect(within(group).getAllByRole("button", { name: /^Make .* the owner$/ })).toHaveLength(1);
  });

  it("explains the rule once someone is picked, and can clear everyone", () => {
    render(<Harness initial={["a", "b"]} />);
    expect(screen.getByText("The first person picked is the owner. Use ☆ to change it.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(value()).toBe("");
    expect(screen.queryByText("The first person picked is the owner. Use ☆ to change it.")).toBeNull();
  });
});
