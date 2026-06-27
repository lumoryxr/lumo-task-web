/**
 * Standards · WCAG-AA text contrast
 *
 * Reads the design tokens straight from index.css and asserts every text token
 * meets WCAG 2.1 AA normal-text contrast (>= 4.5:1) against every surface token
 * it can legitimately sit on. This codifies the accessibility audit: text-faint
 * and text-muted were sub-AA on the dark theme; this guard fails if any token
 * regresses below AA, so future palette tweaks can't silently break legibility.
 *
 * Hover/transient surfaces (bg-subtle) and pure-decoration tokens are out of
 * scope — these are the surfaces real body/label text renders on.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(here, "../../index.css");
const css = readFileSync(cssPath, "utf8");

function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} not found in index.css`);
  return m[1];
}

function relLuminance(hexColor: string): number {
  const h = hexColor.replace("#", "");
  const channel = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Text tokens that render as real informational text.
const TEXT_TOKENS = ["text-primary", "text-secondary", "text-muted", "text-faint"];
// Surfaces these tokens render on (excludes the transient bg-subtle hover state).
const SURFACE_TOKENS = ["bg-base", "bg-surface", "bg-elevated", "bg-deep"];

const AA_NORMAL = 4.5;

describe("WCAG-AA text contrast", () => {
  for (const t of TEXT_TOKENS) {
    for (const s of SURFACE_TOKENS) {
      it(`--${t} on --${s} meets AA (>= ${AA_NORMAL}:1)`, () => {
        const ratio = contrast(token(t), token(s));
        expect(ratio, `${t} (${token(t)}) on ${s} (${token(s)}) = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          AA_NORMAL,
        );
      });
    }
  }
});
