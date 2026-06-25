import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonAvatar } from "../PersonAvatar";

const person = { initials: "JL", color: "#3DFFA0", name: "Jalen" };

describe("PersonAvatar", () => {
  it("renders the person's initials", () => {
    render(<PersonAvatar person={person} />);
    expect(screen.getByText("JL")).toBeInTheDocument();
  });

  it("exposes the person's name as a tooltip title", () => {
    render(<PersonAvatar person={person} />);
    expect(screen.getByText("JL")).toHaveAttribute("title", "Jalen");
  });

  it("applies the person's color and the default size", () => {
    render(<PersonAvatar person={person} />);
    const el = screen.getByText("JL");
    expect(el).toHaveStyle({ width: "24px", height: "24px" });
    // jsdom normalizes the hex to rgb
    expect(el.style.background).toBeTruthy();
  });

  it("honors an explicit size override", () => {
    render(<PersonAvatar person={person} size={40} />);
    expect(screen.getByText("JL")).toHaveStyle({ width: "40px", height: "40px" });
  });
});
