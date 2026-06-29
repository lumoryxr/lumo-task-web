import { describe, it, expect, beforeEach } from "vitest";
import {
  pendingStreakMilestone,
  markStreakMilestoneCelebrated,
  hasCelebratedStreakMilestone,
} from "../streakMilestone";

describe("streakMilestone", () => {
  beforeEach(() => localStorage.clear());

  it("returns null below the first milestone (and for zero/empty user)", () => {
    expect(pendingStreakMilestone("u1", 0)).toBe(null);
    expect(pendingStreakMilestone("u1", 2)).toBe(null);
    expect(pendingStreakMilestone("", 30)).toBe(null);
  });

  it("celebrates a milestone exactly when reached", () => {
    expect(pendingStreakMilestone("u1", 3)).toBe(3);
    expect(pendingStreakMilestone("u2", 7)).toBe(7);
    expect(pendingStreakMilestone("u3", 30)).toBe(30);
  });

  it("celebrates only the highest milestone <= streak (no backfill of lower ones)", () => {
    expect(pendingStreakMilestone("u1", 8)).toBe(7); // 3 and 7 qualify → highest 7
    expect(pendingStreakMilestone("u2", 1000)).toBe(365);
  });

  it("does not re-celebrate a milestone once marked, and does not drop to a lower one", () => {
    expect(pendingStreakMilestone("u1", 7)).toBe(7);
    markStreakMilestoneCelebrated("u1", 7);
    expect(hasCelebratedStreakMilestone("u1", 7)).toBe(true);
    // Still at streak 7, already celebrated → nothing (must NOT fall back to 3).
    expect(pendingStreakMilestone("u1", 7)).toBe(null);
    // Growing into the next milestone celebrates it.
    expect(pendingStreakMilestone("u1", 14)).toBe(14);
  });

  it("is scoped per user", () => {
    markStreakMilestoneCelebrated("u1", 7);
    expect(pendingStreakMilestone("u1", 7)).toBe(null);
    expect(pendingStreakMilestone("u2", 7)).toBe(7);
  });
});
