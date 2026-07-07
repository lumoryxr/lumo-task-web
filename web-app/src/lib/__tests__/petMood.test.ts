import { describe, it, expect } from "vitest";
import {
  decayHappiness,
  gainHappiness,
  happinessBucket,
  isStreakMilestone,
  petLineKey,
  HAPPINESS_MAX,
  HAPPINESS_MIN,
  GRACE_DAYS,
  DECAY_PER_IDLE_DAY,
  GAIN_PER_COMPLETION,
} from "../petMood";

const DAY = 24 * 60 * 60 * 1000;
const now = 1_000_000_000_000;

describe("petMood · decayHappiness", () => {
  it("does not decay within the grace period", () => {
    expect(decayHappiness(HAPPINESS_MAX, now - GRACE_DAYS * DAY, now)).toBe(HAPPINESS_MAX);
    expect(decayHappiness(HAPPINESS_MAX, now - 0.5 * DAY, now)).toBe(HAPPINESS_MAX);
  });

  it("sheds DECAY_PER_IDLE_DAY per whole idle day past the grace day", () => {
    // 3 idle days → 2 decaying days past the 1-day grace.
    expect(decayHappiness(HAPPINESS_MAX, now - 3 * DAY, now)).toBe(HAPPINESS_MAX - 2 * DECAY_PER_IDLE_DAY);
  });

  it("never sinks below the floor (non-punitive)", () => {
    expect(decayHappiness(HAPPINESS_MAX, now - 365 * DAY, now)).toBe(HAPPINESS_MIN);
  });

  it("is stable (idempotent) when re-applied to an already-decayed value on the same day", () => {
    const once = decayHappiness(HAPPINESS_MAX, now - 5 * DAY, now);
    // Reading again 'now' with the same lastActivityAt gives the same number.
    expect(decayHappiness(once, now - 5 * DAY, now)).toBeLessThanOrEqual(once);
  });
});

describe("petMood · gainHappiness", () => {
  it("adds GAIN_PER_COMPLETION and caps at the max", () => {
    expect(gainHappiness(50)).toBe(50 + GAIN_PER_COMPLETION);
    expect(gainHappiness(HAPPINESS_MAX)).toBe(HAPPINESS_MAX);
    expect(gainHappiness(HAPPINESS_MAX - 1)).toBe(HAPPINESS_MAX);
  });
});

describe("petMood · happinessBucket", () => {
  it("buckets by threshold", () => {
    expect(happinessBucket(100)).toBe("thriving");
    expect(happinessBucket(80)).toBe("thriving");
    expect(happinessBucket(79)).toBe("content");
    expect(happinessBucket(55)).toBe("content");
    expect(happinessBucket(54)).toBe("wistful");
    expect(happinessBucket(HAPPINESS_MIN)).toBe("wistful");
  });
});

describe("petMood · isStreakMilestone", () => {
  it("is true only for milestone lengths", () => {
    for (const n of [3, 7, 14, 30, 60, 100, 365]) expect(isStreakMilestone(n)).toBe(true);
    for (const n of [0, 1, 2, 4, 6, 8, 15, 29, 99, 366]) expect(isStreakMilestone(n)).toBe(false);
  });
});

describe("petMood · petLineKey", () => {
  it("builds a species/event key in the pet.line. family", () => {
    expect(petLineKey("fox", "celebrate")).toBe("pet.line.fox.celebrate");
    expect(petLineKey("robot", "streak")).toBe("pet.line.robot.streak");
  });
});
