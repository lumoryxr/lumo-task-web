/**
 * Standards · CSS design tokens (no raw hex on themeable surfaces)
 *
 * CLAUDE.md: "CSS tokens only: bg-surface, text-text-primary,
 * var(--accent-primary). No raw hex." This guard scans component/page source
 * for raw 6-digit hex colors and fails on new offenders, so themeable UI keeps
 * using tokens instead of hard-coded colors.
 *
 * Some files legitimately carry literal colors (inline SVG artwork, fixed
 * habit/pet palettes, the theme-swatch pickers, one-off confetti). Those are
 * listed in ALLOWLIST. Add a file here only when the color is genuinely not a
 * themeable surface — prefer a token otherwise.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "../..");

const SCAN_DIRS = ["components", "pages"];

// Paths (relative to src/) allowed to contain literal hex colors.
const ALLOWLIST = new Set<string>([
  "pages/OnboardingPage.tsx", // accent theme swatches (the literal IS the value)
  "pages/SettingsPage.tsx", // theme swatches + brand logos
  "pages/TodayPage.tsx", // confetti burst palette (one-off animation)
  "components/HabitFormModal.tsx", // fixed habit color palette
  "components/HabitCheckInModal.tsx", // fixed habit color palette
  "components/HabitCalendarModal.tsx", // fixed habit color palette
  "components/DogLevelUpModal.tsx", // pet level palette
  // Baselined pre-existing one-off colors (CLAUDE.md permits truly one-off hex).
  // These predate the guard; the guard now keeps every other surface token-only.
  "components/AuthShell.tsx", // brand auth gradient
  "components/DogEvolutionBadge.tsx", // pet evolution palette
  "components/EveningReviewModal.tsx", // danger red one-offs
  "components/TaskMoreMenu.tsx", // danger red one-off
  "components/BatchActionBar.tsx", // bulk-delete danger red one-off (same as TaskMoreMenu)
  "components/WinControls.tsx", // Windows close-button red
  // A QR code must be true black on true white to stay scannable — it is a
  // machine-readable target, not a themeable surface.
  "components/ShareBrandFooter.tsx",
]);

// Inline SVG artwork (*Svg.tsx) is allowed by convention — colors are artwork.
const isAllowed = (rel: string) => ALLOWLIST.has(rel) || /Svg\.tsx$/.test(rel);

const HEX = /#[0-9a-fA-F]{6}\b/;

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
}

describe("Standards · no raw hex on themeable surfaces", () => {
  it("component/page sources use CSS tokens, not literal hex", () => {
    const files: string[] = [];
    for (const d of SCAN_DIRS) walk(resolve(srcRoot, d), files);

    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(srcRoot, file).replace(/\\/g, "/");
      if (isAllowed(rel)) continue;
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        if (HEX.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`);
      });
    }

    expect(offenders, `raw hex found on themeable surfaces:\n${offenders.join("\n")}`).toEqual([]);
  });
});
