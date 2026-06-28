import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useReducedMotionClass } from "@/hooks/useReducedMotionClass";

let mockReducedMotion = false;
vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: (s: { reducedMotion: boolean }) => unknown) =>
    sel({ reducedMotion: mockReducedMotion }),
}));

describe("useReducedMotionClass", () => {
  beforeEach(() => {
    mockReducedMotion = false;
    document.documentElement.classList.remove("reduce-motion");
  });

  it("adds the reduce-motion class to <html> when the setting is on", () => {
    mockReducedMotion = true;
    renderHook(() => useReducedMotionClass());
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
  });

  it("does not add the class when the setting is off", () => {
    mockReducedMotion = false;
    renderHook(() => useReducedMotionClass());
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(false);
  });

  it("removes the class when toggled off on rerender", () => {
    mockReducedMotion = true;
    const { rerender } = renderHook(() => useReducedMotionClass());
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
    mockReducedMotion = false;
    rerender();
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(false);
  });
});
