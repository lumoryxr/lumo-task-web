import { describe, it, expect } from "vitest";
import { petStatusFromEntries } from "../petStatus";
import type { CompletedEntry } from "@/types/task";

const NOW = new Date("2024-03-20T10:00:00");

function entry(completedAt: string): CompletedEntry {
  return { id: Math.random().toString(), title: { en: "T" }, duration: 25, completedAt };
}

describe("petStatusFromEntries", () => {
  it("falls back to the greeting (key null) with no history", () => {
    expect(petStatusFromEntries([], 0, NOW)).toEqual({ key: null, streak: 0 });
  });

  it("celebrates an active multi-day streak", () => {
    const r = petStatusFromEntries([entry("2024-03-20T08:00:00")], 5, NOW);
    expect(r).toEqual({ key: "pet.status.thriving", streak: 5 });
  });

  it("acknowledges a win today when the streak is still short", () => {
    const r = petStatusFromEntries([entry("2024-03-20T08:00:00")], 1, NOW);
    expect(r.key).toBe("pet.status.today");
  });

  it("nudges a come-back after 2+ idle days (streak broken)", () => {
    // Last completion 3 days ago, nothing today.
    const r = petStatusFromEntries([entry("2024-03-17T08:00:00")], 0, NOW);
    expect(r.key).toBe("pet.status.comeback");
  });

  it("does not nudge come-back after a single idle day", () => {
    // Yesterday only → daysSinceLast = 1, streak 0, nothing today → greeting.
    const r = petStatusFromEntries([entry("2024-03-19T08:00:00")], 0, NOW);
    expect(r.key).toBe(null);
  });

  it("prioritises come-back over a stale streak value", () => {
    // Defensive: even if a streak number lingers, 3 idle days means come-back.
    const r = petStatusFromEntries([entry("2024-03-15T08:00:00")], 9, NOW);
    expect(r.key).toBe("pet.status.comeback");
  });

  it("counts only today's entries for the today signal (ignores earlier same-week)", () => {
    const r = petStatusFromEntries(
      [entry("2024-03-18T08:00:00"), entry("2024-03-20T09:00:00")],
      1,
      NOW,
    );
    expect(r.key).toBe("pet.status.today");
  });
});
