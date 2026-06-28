/**
 * Standards · border-radius uses tokens, not raw px for scale values
 *
 * The radius scale lives in design tokens: --radius-sm (4) / --radius-md (8) /
 * --radius-lg (12) / --radius-xl (20). This guard fails on an inline
 * `borderRadius: 12` (or `"12px"`) that hard-codes one of those scale values
 * instead of referencing the token, so the rhythm stays consistent and
 * themeable. Deliberately NOT flagged: `50%`/circle radii, compound values
 * (e.g. "12px 12px 12px 3px"), and bespoke one-offs (2/3/6/24…) that have no
 * token — converting those would change values or add scale noise.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "../..");

// Scale values that have a token. Keep in sync with --radius-* in index.css.
const TOKENED: Record<string, string> = { "4": "sm", "8": "md", "12": "lg", "20": "xl" };

// borderRadius: <value up to the next , or }>  — captures the raw value token
const RADIUS = /borderRadius:\s*([^,}]+)/g;

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

describe("border-radius uses design tokens", () => {
  it("no inline borderRadius hard-codes a tokened scale value (4/8/12/20)", () => {
    const offenders: string[] = [];
    for (const file of walk(srcRoot)) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("borderRadius")) continue;
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        let m: RegExpExecArray | null;
        RADIUS.lastIndex = 0;
        while ((m = RADIUS.exec(line)) !== null) {
          const raw = m[1].trim().replace(/['"]/g, "");
          // Only a single pure value: "12px" or 12 — skip compound / % / var().
          const pure = raw.match(/^(\d+)(px)?$/);
          if (!pure) continue;
          const num = pure[1];
          if (TOKENED[num]) {
            offenders.push(`${relative(srcRoot, file)}:${i + 1}  borderRadius: ${raw}  → var(--radius-${TOKENED[num]})`);
          }
        }
      });
    }
    expect(offenders, `use a --radius-* token:\n${offenders.join("\n")}`).toEqual([]);
  });
});
