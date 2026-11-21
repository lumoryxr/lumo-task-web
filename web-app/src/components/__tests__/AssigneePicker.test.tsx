import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AssigneePicker } from "../AssigneePicker";

const p = (id: string, name: string) => ({ id, name, initials: name.slice(0, 1), color: "var(--accent-primary)" });
const PEOPLE = [p("a", "Ann"), p("b", "Bo"), p("c", "Cy")];

function Harness({ initial = [] as string[], part = "both" as "both" | "primary" | "collaborators" }) {
  const [ids, setIds] = useState(initial);
  return (
    <>
      <AssigneePicker people={PEOPLE} value={ids} onChange={setIds} part={part} />
      <output data-testid="value">{ids.join(",")}</output>
    </>
  );
}

const value = () => screen.getByTestId("value").textContent;
const ownerGroup = () => screen.getByRole("radiogroup", { name: "Owner" });
const collabGroup = () => screen.getByRole("group", { name: "Also assigned" });
const owner = (name: string) => within(ownerGroup()).getByRole("radio", { name });
const collab = (name: string) => within(collabGroup()).getByRole("button", { name });

describe("AssigneePicker", () => {
  it("picks exactly one owner: choosing another replaces it", () => {
    render(<Harness />);
    fireEvent.click(owner("Bo"));
    expect(value()).toBe("b");
    expect(owner("Bo")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(owner("Ann"));
    expect(value()).toBe("a");
    expect(owner("Bo")).toHaveAttribute("aria-checked", "false");
  });

  it("adds several collaborators once an owner is picked; the owner is not offered again", () => {
    render(<Harness initial={["a"]} />);
    expect(within(collabGroup()).queryByRole("button", { name: "Ann" })).toBeNull();
    fireEvent.click(collab("Cy"));
    fireEvent.click(collab("Bo"));
    expect(value()).toBe("a,c,b");
    fireEvent.click(collab("Cy"));
    expect(value()).toBe("a,b");
  });

  it("collaborators need an owner first", () => {
    render(<Harness />);
    expect(screen.getByText("Pick an owner first")).toBeInTheDocument();
    for (const b of within(collabGroup()).getAllByRole("button")) expect(b).toBeDisabled();
  });

  it("making a collaborator the owner moves them out of the collaborators", () => {
    render(<Harness initial={["a", "b", "c"]} />);
    fireEvent.click(owner("Cy"));
    // Cy leads; the previous owner (Ann) is replaced, Bo stays a collaborator.
    expect(value()).toBe("c,b");
  });

  it("clearing the owner promotes the first collaborator, so a team always has an owner", () => {
    render(<Harness initial={["a", "b", "c"]} />);
    fireEvent.click(owner("Ann"));
    expect(value()).toBe("b,c");
    fireEvent.click(owner("Bo")); // Bo was promoted; clearing promotes Cy
    expect(value()).toBe("c");
    fireEvent.click(owner("Cy"));
    expect(value()).toBe("");
  });

  it("can show just the owner part, or just the collaborators part", () => {
    const { unmount } = render(<Harness part="primary" />);
    expect(screen.getByRole("radiogroup", { name: "Owner" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Also assigned" })).toBeNull();
    unmount();
    render(<Harness part="collaborators" initial={["a"]} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByRole("group", { name: "Also assigned" })).toBeInTheDocument();
  });
});
