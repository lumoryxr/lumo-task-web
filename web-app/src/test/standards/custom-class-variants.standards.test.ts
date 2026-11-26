/**
 * Standards · no Tailwind variant prefix on the app's own CSS classes
 *
 * Classes defined by hand in index.css (`scroll-y`, `surface-card`, `btn`…)
 * are not Tailwind utilities, so a variant prefix such as `sm:scroll-y`
 * generates no CSS at all and silently does nothing. That is how the Matrix
 * quadrants lost their scrolling: `sm:scroll-y` left the list at
 * `overflow: visible` inside an `overflow: hidden` card, so extra tasks were
 * clipped with no way to reach them. Responsive behaviour for a custom class
 * belongs in index.css (a media query), or use real Tailwind utilities.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Class names that index.css defines itself (a rule starting with `.name`). */
function customClasses(): Set<string> {
  const css = readFileSync(resolve(srcRoot, "index.css"), "utf8");
  const names = new Set<string>();
  for (const m of css.matchAll(/(?:^|[\s,}])\.([a-z][a-z0-9_-]*)(?=[\s,{:.[>])/gm)) names.add(m[1]);
  return names;
}

describe("custom CSS classes", () => {
  it("are never given a Tailwind variant prefix (it would generate no CSS)", () => {
    const custom = customClasses();
    expect(custom.has("scroll-y"), "sanity: index.css defines scroll-y").toBe(true);
    const offenders: string[] = [];
    for (const file of walk(srcRoot)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/(?<![\w-])((?:[a-z0-9-]+:)+)([a-z][a-z0-9_-]*)/g)) {
        const [, variants, cls] = m;
        // Only class-string variants (sm:, md:, hover:, max-sm: …), not URLs or TS syntax.
        if (!/^(?:(?:sm|md|lg|xl|2xl|max-sm|max-md|max-lg|hover|focus|focus-visible|active|group-hover|dark):)+$/.test(variants)) continue;
        if (custom.has(cls)) offenders.push(`${relative(srcRoot, file)}: ${variants}${cls}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the Matrix quadrant lists scroll on their own in the 2×2 grid", () => {
    const css = readFileSync(resolve(srcRoot, "index.css"), "utf8");
    const media = css.match(/@media \(min-width: 640px\) \{\s*\.quadrant-list \{([^}]*)\}/);
    expect(media, "a ≥640px rule for .quadrant-list").not.toBeNull();
    expect(media?.[1]).toMatch(/overflow-y:\s*auto/);
    expect(media?.[1]).toMatch(/min-height:\s*0/);
    const page = readFileSync(resolve(srcRoot, "pages/MatrixPage.tsx"), "utf8");
    expect(page).toContain('className="quadrant-list');
    // Quadrants never squeeze below a readable height; the board scrolls instead.
    expect(page).toMatch(/sm:grid-rows-\[repeat\(2,minmax\(\d+px,1fr\)\)\]/);
  });
});
