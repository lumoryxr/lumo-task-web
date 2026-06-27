/**
 * Standards · box-shadow uses tokens, not raw color literals
 *
 * Elevation should come from the --shadow-* design tokens (card / lifted /
 * window / modal) so depth stays consistent and themeable. This guard fails on
 * an inline `boxShadow: "…"` literal that bakes in a raw color (rgba()/hex) with
 * no `var(--…)` reference — the kind of one-off that drifts from the system.
 * A shadow that composes a token with an extra ring (contains `var(`) is fine.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "../..");

// boxShadow: "…"  — capture the literal value
const SHADOW = /boxShadow:\s*"([^"]+)"/g;
const RAW_COLOR = /(rgba?\(|#[0-9a-fA-F]{3,8})/;

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

describe("box-shadow uses design tokens", () => {
  it("no inline boxShadow bakes in a raw color without a var(--shadow-*) token", () => {
    const offenders: string[] = [];
    for (const file of walk(srcRoot)) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("boxShadow")) continue;
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        let m: RegExpExecArray | null;
        SHADOW.lastIndex = 0;
        while ((m = SHADOW.exec(line)) !== null) {
          const value = m[1];
          if (RAW_COLOR.test(value) && !value.includes("var(")) {
            offenders.push(`${relative(srcRoot, file)}:${i + 1}  boxShadow: "${value}"`);
          }
        }
      });
    }
    expect(offenders, `use a --shadow-* token:\n${offenders.join("\n")}`).toEqual([]);
  });
});
