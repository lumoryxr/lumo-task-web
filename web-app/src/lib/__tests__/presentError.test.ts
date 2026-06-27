import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/api/ApiError";

const mockToastError = vi.fn();
vi.mock("@/store/useToastStore", () => ({
  toast: { error: (...a: unknown[]) => mockToastError(...a) },
}));
// Keep i18n deterministic: t(key) → key.
vi.mock("@/i18n/useT", () => ({ t: (k: string) => k }));

import { presentError, detailOf, fieldErrorsOf } from "../presentError";

describe("detailOf", () => {
  it("returns the full backend message from an ApiError (complete, specific)", () => {
    const e = new ApiError("password: must include a number", { code: "VALIDATION_ERROR", status: 400 });
    expect(detailOf(e)).toBe("password: must include a number");
  });
  it("falls back to Error.message for a plain Error", () => {
    expect(detailOf(new Error("boom"))).toBe("boom");
  });
  it("stringifies non-error throwables", () => {
    expect(detailOf("nope")).toBe("nope");
  });
});

describe("presentError", () => {
  beforeEach(() => vi.clearAllMocks());
  it("shows a localized title + the raw backend detail", () => {
    presentError(new ApiError("email: Invalid email", { code: "VALIDATION_ERROR" }), "error.auth.signin");
    expect(mockToastError).toHaveBeenCalledWith("error.auth.signin", "email: Invalid email");
  });
  it("uses a generic title when none is given", () => {
    presentError(new Error("kaboom"));
    expect(mockToastError).toHaveBeenCalledWith("error.unknown", "kaboom");
  });
});

describe("fieldErrorsOf", () => {
  it("maps an ApiError's fields to { path: message }", () => {
    const e = new ApiError("validation failed", {
      code: "VALIDATION_ERROR",
      status: 400,
      fields: [
        { path: "email", message: "Invalid email" },
        { path: "password", message: "Too short" },
      ],
    });
    expect(fieldErrorsOf(e)).toEqual({ email: "Invalid email", password: "Too short" });
  });
  it("keeps the first message per field", () => {
    const e = new ApiError("x", {
      fields: [
        { path: "password", message: "first" },
        { path: "password", message: "second" },
      ],
    });
    expect(fieldErrorsOf(e)).toEqual({ password: "first" });
  });
  it("returns {} for errors without field detail (usable unconditionally)", () => {
    expect(fieldErrorsOf(new ApiError("nope", { code: "INVALID_CREDENTIALS" }))).toEqual({});
    expect(fieldErrorsOf(new Error("plain"))).toEqual({});
  });
});
