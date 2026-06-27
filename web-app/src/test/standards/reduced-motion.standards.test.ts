/**
 * Standards · global reduced-motion reset is present
 *
 * Users who set the OS "reduce motion" preference must not get the app's
 * decorative loops and entrance animations (vestibular accessibility). This
 * asserts index.css ships a global `@media (prefers-reduced-motion: reduce)`
 * block that neutralises animation/transition durations on every element — so
 * the safety net can't be removed without failing CI.
 *
 * (Runtime behaviour isn't asserted here: Playwright's reducedMotion emulation
 * doesn't reliably drive the media query for computed-style reads in this
 * harness. The rule itself is the canonical reset, so presence + shape is the
 * dependable guard.)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../../index.css"), "utf8");

describe("global reduced-motion reset", () => {
  // Pull out each @media (prefers-reduced-motion: reduce) { … } block body.
  const blocks: string[] = [];
  const re = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    // Walk braces from the opening { to find the matching close.
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    blocks.push(css.slice(m.index, i));
  }

  it("declares at least one prefers-reduced-motion media block", () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  it("has a universal block that neutralises animation + transition durations", () => {
    const universal = blocks.find(
      (b) => /\*\s*,?/.test(b) && /animation-duration\s*:/.test(b) && /transition-duration\s*:/.test(b),
    );
    expect(universal, "expected a `* { animation-duration … transition-duration … }` reduced-motion block").toBeTruthy();
    expect(universal).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(universal).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  });
});
