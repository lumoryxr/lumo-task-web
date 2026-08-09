import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LegalModal } from "../LegalModal";

// useT returns the key verbatim; content prose comes from the real content.ts.
vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));

// Pin the locale so we can assert on the English prose deterministically.
vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: (s: { locale: string }) => unknown) => sel({ locale: "en" }),
}));

describe("LegalModal", () => {
  it("renders nothing when docKey is null", () => {
    const { container } = render(<LegalModal docKey={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the Terms document when docKey='terms'", () => {
    render(<LegalModal docKey="terms" onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", "Terms of Service");
    expect(screen.getByText(/Acceptable use/)).toBeInTheDocument();
  });

  it("renders the Privacy document when docKey='privacy'", () => {
    render(<LegalModal docKey="privacy" onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Privacy Policy");
    expect(screen.getByText(/Data we collect/)).toBeInTheDocument();
  });

  it("does NOT show a draft/template banner (legal content is finalized)", () => {
    render(<LegalModal docKey="terms" onClose={() => {}} />);
    expect(screen.queryByText(/starting template/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/counsel-reviewed language before launch/i)).not.toBeInTheDocument();
    // A real, finalized section is present instead.
    expect(screen.getByText(/Limitation of liability/)).toBeInTheDocument();
  });

  it("calls onClose when the close (X) button is clicked", () => {
    const onClose = vi.fn();
    render(<LegalModal docKey="terms" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "legal.modal.close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<LegalModal docKey="terms" onClose={onClose} />);
    const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close when the panel body is clicked", () => {
    const onClose = vi.fn();
    render(<LegalModal docKey="terms" onClose={onClose} />);
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<LegalModal docKey="terms" onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
