import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OAuthButton } from "../OAuthButton";

/**
 * OAuthButton is now GitHub-only (#15) — the Google/Apple stubs were removed
 * from the `Provider` union and the icon map. These tests lock in the GitHub
 * button behavior and the disabled state.
 */
describe("OAuthButton", () => {
  it("renders the GitHub button with its label and glyph", () => {
    render(<OAuthButton provider="github" label="Continue with GitHub" />);
    const btn = screen.getByRole("button", { name: /continue with github/i });
    expect(btn).toBeInTheDocument();
    // The inline brand glyph is rendered (no external icon dep).
    expect(btn.querySelector("svg")).not.toBeNull();
  });

  it("fires onClick when pressed", () => {
    const onClick = vi.fn();
    render(<OAuthButton provider="github" label="Continue with GitHub" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick while disabled", () => {
    const onClick = vi.fn();
    render(<OAuthButton provider="github" label="Continue with GitHub" onClick={onClick} disabled />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("no longer maps google/apple providers (GitHub is the only glyph)", () => {
    // The icon map exposes exactly one provider now. A regression that
    // re-introduces a stub would surface here (and as a type error at the
    // call sites), guarding the 'GitHub-only' decision.
    const google = render(<OAuthButton provider={"google" as "github"} label="x" />);
    // An unknown provider yields no glyph — the removed icons are truly gone.
    expect(google.container.querySelector("svg")).toBeNull();
  });
});
