import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDocumentLang } from "@/hooks/useDocumentLang";
import type { Locale } from "@/types/task";

let mockLocale: Locale = "en";
vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: (s: { locale: Locale }) => unknown) =>
    sel({ locale: mockLocale }),
}));

describe("useDocumentLang", () => {
  beforeEach(() => {
    mockLocale = "en";
    document.documentElement.lang = "";
  });

  it("sets <html lang> to the active locale on mount", () => {
    mockLocale = "zh";
    renderHook(() => useDocumentLang());
    expect(document.documentElement.lang).toBe("zh");
  });

  it("uses 'en' when the locale is English", () => {
    mockLocale = "en";
    renderHook(() => useDocumentLang());
    expect(document.documentElement.lang).toBe("en");
  });

  it("updates <html lang> when the locale changes on rerender", () => {
    mockLocale = "en";
    const { rerender } = renderHook(() => useDocumentLang());
    expect(document.documentElement.lang).toBe("en");
    mockLocale = "zh";
    rerender();
    expect(document.documentElement.lang).toBe("zh");
  });
});
