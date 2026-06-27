import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders the icon, title and subtitle", () => {
    render(
      <EmptyState
        icon={<svg data-testid="the-icon" />}
        title="No members yet"
        subtitle="Add teammates to assign tasks."
      />
    );
    expect(screen.getByText("No members yet")).toBeInTheDocument();
    expect(screen.getByText("Add teammates to assign tasks.")).toBeInTheDocument();
    expect(screen.getByTestId("the-icon")).toBeInTheDocument();
  });

  it("renders a CTA and fires its handler on click", () => {
    const onClick = vi.fn();
    render(
      <EmptyState icon={<svg />} title="Nothing here" cta={{ label: "Add member", onClick }} />
    );
    const btn = screen.getByRole("button", { name: "Add member" });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders no button when no CTA is provided", () => {
    render(<EmptyState icon={<svg />} title="Nothing here" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("omits the subtitle when not provided", () => {
    const { container } = render(<EmptyState icon={<svg />} title="Just a title" />);
    expect(screen.getByText("Just a title")).toBeInTheDocument();
    // Only the title text node should be present besides the icon container.
    expect(container.textContent).toBe("Just a title");
  });

  it("is a single polite status region with a decorative icon", () => {
    render(<EmptyState icon={<svg data-testid="ic" />} title="Empty" subtitle="sub" />);
    const region = screen.getByRole("status");
    expect(region).toBeInTheDocument();
    // The icon lives inside an aria-hidden container (decorative, not announced).
    const icon = screen.getByTestId("ic");
    expect(icon.parentElement).toHaveAttribute("aria-hidden", "true");
  });
});
