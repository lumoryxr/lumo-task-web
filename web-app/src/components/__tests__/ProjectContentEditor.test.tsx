import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// TipTap doesn't run under jsdom: a fake editor exposes the onUpdate hook.
const captured: { onUpdate?: (a: { editor: unknown }) => void } = {};
const fakeEditor = {
  getJSON: () => ({ type: "doc", content: [{ type: "paragraph" }] }),
  setEditable: vi.fn(),
  isActive: () => false,
  chain: () => ({ focus: () => ({}) }),
};
vi.mock("@tiptap/react", () => ({
  useEditor: (opts: { onUpdate: (a: { editor: unknown }) => void }) => {
    captured.onUpdate = opts.onUpdate;
    return fakeEditor;
  },
  EditorContent: ({ className }: { className?: string }) => <div data-testid="content" className={className} />,
}));
vi.mock("@tiptap/starter-kit", () => ({ default: {} }));
vi.mock("@tiptap/extension-image", () => ({ default: { configure: () => ({}) } }));
vi.mock("@/i18n/useT", () => ({ useT: () => (key: string) => key }));

import { ProjectContentEditor } from "../ProjectContentEditor";

describe("ProjectContentEditor", () => {
  it("saves the last edit when closed before the autosave delay runs", () => {
    const onChange = vi.fn();
    const { unmount } = render(<ProjectContentEditor value="" onChange={onChange} />);
    captured.onUpdate!({ editor: fakeEditor });
    expect(onChange).not.toHaveBeenCalled(); // still debounced
    unmount();
    expect(onChange).toHaveBeenCalledWith(JSON.stringify(fakeEditor.getJSON()));
  });

  it("does not save on close when nothing was typed", () => {
    const onChange = vi.fn();
    const { unmount } = render(<ProjectContentEditor value="" onChange={onChange} />);
    unmount();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fill mode stretches the writing area and uses larger text", () => {
    const { getByTestId } = render(<ProjectContentEditor value="" onChange={vi.fn()} fill />);
    const content = getByTestId("content");
    expect(content.className).toContain("flex-1");
    expect(content.className).toContain("text-[15px]");
  });
});
