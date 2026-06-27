/**
 * Standards · no hardcoded CJK in user-facing attributes
 *
 * Every user-facing string must go through t(). A raw CJK literal in a
 * user-facing attribute (aria-label / title / placeholder / alt) is an outright
 * i18n bug: English users get Chinese text, because — unlike a
 * `locale === "zh" ? … : …` ternary — a bare literal has no English path.
 *
 * This guard scans component/page source for those attributes written as a
 * double-quoted literal containing CJK and fails on any. The ternary form uses
 * `attr={…}` (braces), so legitimate bilingual code is not flagged. Visible JSX
 * text is out of scope here (caught at the render layer by the Playwright i18n
 * guards, TC75–78); this targets the attribute bugs that don't render as text.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "../..");

const CJK = /[一-鿿]/;
// aria-label | title | placeholder | alt  =  "…CJK…"
const BAD_ATTR = /\b(aria-label|title|placeholder|alt)\s*=\s*"[^"]*[一-鿿][^"]*"/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "test") continue;
      out.push(...walk(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("no hardcoded CJK in user-facing attributes", () => {
  it("aria-label / title / placeholder / alt never contain a raw CJK literal", () => {
    const offenders: string[] = [];
    for (const file of walk(srcRoot)) {
      const src = readFileSync(file, "utf8");
      if (!CJK.test(src)) continue;
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        const matches = line.match(BAD_ATTR);
        if (matches) {
          for (const m of matches) offenders.push(`${relative(srcRoot, file)}:${i + 1}  ${m.trim()}`);
        }
      });
    }
    expect(offenders, `route these through t():\n${offenders.join("\n")}`).toEqual([]);
  });
});
