/**
 * Standards · bottom-fixed chrome respects the mobile safe-area inset
 *
 * On notched / gesture-nav phones the home indicator overlaps the bottom edge.
 * The fixed bottom tab bar, the content scroll area that reserves room for it,
 * and bottom-anchored toasts must account for `env(safe-area-inset-bottom)` so
 * content isn't clipped or hidden. Headless Chromium reports a 0 inset (no
 * notch), so this is guarded at the source level rather than in Playwright.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "../..");
const read = (rel: string) => readFileSync(resolve(srcRoot, rel), "utf8");

describe("mobile safe-area insets", () => {
  it("Shell reserves the tab bar AND the safe-area inset below scroll content", () => {
    const shell = read("components/Shell.tsx");
    // the bottom tab bar itself
    expect(shell, "tab bar should pad for the safe-area inset").toContain(
      'paddingBottom: "env(safe-area-inset-bottom)"',
    );
    // the scroll container must clear tab bar height + inset, not a flat px
    expect(shell, "scroll area should clear tab bar + safe-area inset").toMatch(
      /calc\(64px \+ env\(safe-area-inset-bottom\)\)/,
    );
  });

  it("ToastStack lifts toasts above the mobile tab bar + safe-area inset", () => {
    const toast = read("components/ToastStack.tsx");
    expect(toast).toMatch(/env\(safe-area-inset-bottom\)/);
  });
});
