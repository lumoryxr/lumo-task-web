import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Spinner } from "../Spinner";

describe("Spinner", () => {
  it("renders a decorative spinner with the .spinner class", () => {
    const { container } = render(<Spinner />);
    const el = container.querySelector(".spinner") as HTMLElement;
    expect(el).toBeTruthy();
    // Decorative: hidden from the a11y tree (the surrounding control carries aria-busy).
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("sizes the box from the size prop", () => {
    const { container } = render(<Spinner size={24} />);
    const el = container.querySelector(".spinner") as HTMLElement;
    expect(el.style.width).toBe("24px");
    expect(el.style.height).toBe("24px");
  });

  it("uses a 2px border at small sizes and scales it up when larger", () => {
    const small = render(<Spinner size={16} />).container.querySelector(".spinner") as HTMLElement;
    expect(small.style.borderWidth).toBe("2px");
    const large = render(<Spinner size={32} />).container.querySelector(".spinner") as HTMLElement;
    expect(large.style.borderWidth).toBe("4px");
  });
});
