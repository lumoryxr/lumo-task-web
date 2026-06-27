import { describe, it, expect } from "vitest";
import { isShareCancellation } from "../share";

describe("isShareCancellation", () => {
  it("treats a Web Share AbortError as a cancellation (stay silent)", () => {
    expect(isShareCancellation(new DOMException("user cancelled", "AbortError"))).toBe(true);
  });

  it("treats a real export failure as NOT a cancellation (surface it)", () => {
    expect(isShareCancellation(new Error("Canvas export failed"))).toBe(false);
  });

  it("treats other DOMExceptions (e.g. denied permission) as real failures", () => {
    expect(isShareCancellation(new DOMException("blocked", "NotAllowedError"))).toBe(false);
  });

  it("handles non-error throwables defensively", () => {
    expect(isShareCancellation("boom")).toBe(false);
    expect(isShareCancellation(undefined)).toBe(false);
    expect(isShareCancellation(null)).toBe(false);
  });
});
