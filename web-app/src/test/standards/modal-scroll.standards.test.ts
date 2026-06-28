/**
 * Standards · overlay modals stay usable on short / mobile screens
 *
 * A centered modal taller than the viewport must cap its height and scroll
 * internally, or its action area (save/close buttons at the bottom) gets
 * clipped and becomes unreachable. Headless jsdom has no layout, so this is
 * guarded at the source level rather than via a rendered scroll assertion.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "../..");
const read = (rel: string) => readFileSync(resolve(srcRoot, rel), "utf8");

describe("overlay modal height / scroll", () => {
  it("TaskDetailModal caps its height and scrolls internally", () => {
    const src = read("components/TaskDetailModal.tsx");
    expect(src, "dialog should cap height to the viewport").toMatch(/maxHeight:\s*["'`][^"'`]*vh/);
    expect(src, "dialog should scroll its content vertically").toContain("overflow-y-auto");
    // It must NOT clip with a bare overflow-hidden root anymore.
    expect(src).not.toMatch(/className="w-full overflow-hidden rounded/);
  });
});
