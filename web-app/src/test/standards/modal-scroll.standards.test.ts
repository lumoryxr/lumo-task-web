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
  it("the shared task-dialog frame caps height to the window and scrolls only its body", () => {
    const css = read("index.css");
    const rule = (sel: string) => {
      const m = css.match(new RegExp(`${sel.replace(/[.-]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`));
      return m ? m[1] : "";
    };
    expect(rule(".task-dialog-backdrop"), "backdrop fills the window").toMatch(/position:\s*fixed/);
    expect(rule(".task-dialog-backdrop")).toMatch(/inset:\s*0/);
    expect(rule(".task-dialog"), "dialog never exceeds the window").toMatch(/max-height:\s*100%/);
    expect(rule(".task-dialog"), "width follows the screen").toMatch(/width:\s*clamp\(/);
    expect(rule(".task-dialog__body"), "the body scrolls").toMatch(/overflow-y:\s*auto/);
    expect(rule(".task-dialog__body"), "the body can shrink").toMatch(/min-height:\s*0/);
  });

  it.each(["components/TaskDetailModal.tsx", "components/TaskEditModal.tsx", "components/QuickCreate.tsx"])(
    "%s uses the frame, with no fixed width or viewport-height cap of its own",
    (file) => {
      const src = read(file);
      expect(src).toContain("task-dialog-backdrop");
      expect(src).toMatch(/className="task-dialog[ "]/);
      expect(src).toContain("task-dialog__body");
      expect(src, "no hard-coded dialog width").not.toMatch(/maxWidth:\s*(480|520)\b/);
      expect(src, "no negative top margin pushing it off short screens").not.toMatch(/marginTop:\s*"-\d+vh"/);
      // It must NOT clip with a bare overflow-hidden root.
      expect(src).not.toMatch(/className="w-full overflow-hidden rounded/);
    },
  );
});
