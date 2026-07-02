import { describe, it, expect } from "vitest";
import { detectCountdownTheme } from "../countdownTheme";

describe("detectCountdownTheme", () => {
  it("detects theme from emoji (strongest signal)", () => {
    expect(detectCountdownTheme({ emoji: "🎂", title: "" })).toBe("birthday");
    expect(detectCountdownTheme({ emoji: "❤️", title: "" })).toBe("love");
    expect(detectCountdownTheme({ emoji: "✈️", title: "" })).toBe("travel");
    expect(detectCountdownTheme({ emoji: "🎓", title: "" })).toBe("graduation");
    expect(detectCountdownTheme({ emoji: "🎄", title: "" })).toBe("festival");
    expect(detectCountdownTheme({ emoji: "🚀", title: "" })).toBe("milestone");
  });

  it("falls back to title keywords (EN + ZH)", () => {
    expect(detectCountdownTheme({ title: "Mom's Birthday" })).toBe("birthday");
    expect(detectCountdownTheme({ title: "结婚纪念日" })).toBe("love");
    expect(detectCountdownTheme({ title: "Tokyo trip" })).toBe("travel");
    expect(detectCountdownTheme({ title: "毕业答辩" })).toBe("graduation");
    expect(detectCountdownTheme({ title: "春节" })).toBe("festival");
    expect(detectCountdownTheme({ title: "Product launch deadline" })).toBe("milestone");
  });

  it("prefers emoji over a conflicting title keyword", () => {
    expect(detectCountdownTheme({ emoji: "🎂", title: "project deadline" })).toBe("birthday");
  });

  it("is case-insensitive on titles", () => {
    expect(detectCountdownTheme({ title: "BIRTHDAY PARTY" })).toBe("birthday");
  });

  it("matches whole ASCII words only (no substring false positives)", () => {
    expect(detectCountdownTheme({ title: "overdue library book" })).toBe("default"); // not "due" → milestone
    expect(detectCountdownTheme({ title: "contest results" })).toBe("default");       // not "test" → graduation
    expect(detectCountdownTheme({ title: "glove order" })).toBe("default");           // not "love"
    expect(detectCountdownTheme({ title: "roundtrip flight" })).toBe("travel");       // "flight" word, not "trip"
    // Multi-word ASCII phrases still match as phrases.
    expect(detectCountdownTheme({ title: "New Year party" })).toBe("festival");
  });

  it("ignores the U+FE0F variation selector on emoji", () => {
    expect(detectCountdownTheme({ emoji: "✈️", title: "" })).toBe("travel"); // with VS16
    expect(detectCountdownTheme({ emoji: "✈", title: "" })).toBe("travel");        // bare codepoint
  });

  it("returns 'default' when nothing matches", () => {
    expect(detectCountdownTheme({ title: "随便记一下" })).toBe("default");
    expect(detectCountdownTheme({ emoji: "", title: "" })).toBe("default");
  });
});
