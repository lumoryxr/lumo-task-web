import { describe, it, expect } from "vitest";
import { fitDimensions, dataUrlByteSize, MAX_IMAGE_DIM } from "@/lib/imageCompress";

describe("fitDimensions", () => {
  it("never upscales an image smaller than the cap", () => {
    expect(fitDimensions(800, 600, 1280)).toEqual({ w: 800, h: 600 });
  });

  it("scales the longest edge down to maxDim, preserving aspect ratio", () => {
    const r = fitDimensions(2560, 1440, 1280);
    expect(r.w).toBe(1280);
    expect(r.h).toBe(720); // 1440 * (1280/2560)
  });

  it("handles portrait orientation (height is the longest edge)", () => {
    const r = fitDimensions(1000, 4000, 1280);
    expect(r.h).toBe(1280);
    expect(r.w).toBe(320);
  });

  it("clamps to at least 1px and tolerates zero input", () => {
    expect(fitDimensions(0, 0, 1280)).toEqual({ w: 0, h: 0 });
    const r = fitDimensions(10000, 1, MAX_IMAGE_DIM);
    expect(r.w).toBe(MAX_IMAGE_DIM);
    expect(r.h).toBe(1);
  });
});

describe("dataUrlByteSize", () => {
  it("computes decoded byte size from a base64 data URL", () => {
    // "hello" → aGVsbG8= (8 base64 chars, 1 pad) → 5 bytes
    const url = "data:text/plain;base64,aGVsbG8=";
    expect(dataUrlByteSize(url)).toBe(5);
  });

  it("handles a raw base64 string without a header", () => {
    expect(dataUrlByteSize("aGk=")).toBe(2); // "hi"
  });

  it("scales roughly linearly with payload length", () => {
    const small = dataUrlByteSize("data:image/jpeg;base64," + "A".repeat(400));
    const big = dataUrlByteSize("data:image/jpeg;base64," + "A".repeat(4000));
    expect(big).toBeGreaterThan(small * 9);
  });
});
