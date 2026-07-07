/**
 * Unit · planner (#172 V1 — time-budgeted today-plan selection)
 *
 * Pure logic, no HTTP/DB: exercises priority ordering, the maxTasks cap, and the
 * time-budget invariant (total estimated minutes never exceed available_hours).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  selectTodayPlan,
  planTaskMinutes,
  effectiveBudgetHours,
  DEFAULT_TASK_MINUTES,
  type PlanCandidate,
} from "../../lib/planner.js";

function task(id: string, quadrant: string, duration?: number, due?: string | null): PlanCandidate {
  return { id, quadrant, duration, due };
}

const totalMinutes = (picked: PlanCandidate[]) =>
  picked.reduce((s, t) => s + planTaskMinutes(t), 0);

describe("planner · selectTodayPlan", () => {
  test("without a budget: top N by priority, capped at maxTasks", () => {
    const cands = [
      task("a", "Q3", 60),
      task("b", "Q1", 60),
      task("c", "Q2", 60),
      task("d", "Q1", 60),
    ];
    const picked = selectTodayPlan(cands, { maxTasks: 2, availableHours: null });
    assert.equal(picked.length, 2);
    assert.deepEqual(picked.map((t) => t.id), ["b", "d"]); // both Q1 first
  });

  test("Q1 sorts before Q2 before Q3, then earliest due", () => {
    const cands = [
      task("late", "Q1", 30, "2026-07-10"),
      task("early", "Q1", 30, "2026-07-08"),
      task("q2", "Q2", 30),
    ];
    const picked = selectTodayPlan(cands, { maxTasks: 3, availableHours: null });
    assert.deepEqual(picked.map((t) => t.id), ["early", "late", "q2"]);
  });

  test("budget: total estimated minutes never exceed available_hours", () => {
    const cands = [
      task("a", "Q1", 90),
      task("b", "Q1", 90),
      task("c", "Q2", 90),
    ];
    // 2h = 120 min budget → only the first 90-min task fits.
    const picked = selectTodayPlan(cands, { maxTasks: 5, availableHours: 2 });
    assert.ok(totalMinutes(picked) <= 120, `total ${totalMinutes(picked)} must be ≤ 120`);
    assert.equal(picked.length, 1);
    assert.equal(picked[0].id, "a");
  });

  test("budget skips an overflowing high-priority task so a smaller one still fits", () => {
    const cands = [
      task("big", "Q1", 200), // doesn't fit a 3h budget alone-plus-others path
      task("small", "Q2", 30),
    ];
    // 3h = 180 min. "big" (200) overflows → skipped; "small" (30) fits.
    const picked = selectTodayPlan(cands, { maxTasks: 5, availableHours: 3 });
    assert.deepEqual(picked.map((t) => t.id), ["small"]);
    assert.ok(totalMinutes(picked) <= 180);
  });

  test("zero/unset duration falls back to DEFAULT_TASK_MINUTES against the budget", () => {
    assert.equal(planTaskMinutes({ duration: 0 }), DEFAULT_TASK_MINUTES);
    assert.equal(planTaskMinutes({}), DEFAULT_TASK_MINUTES);
    const cands = Array.from({ length: 10 }, (_, i) => task(`t${i}`, "Q1", 0));
    // 1h budget with 30-min fallback each → exactly 2 fit (not all 10).
    const picked = selectTodayPlan(cands, { maxTasks: 10, availableHours: 1 });
    assert.equal(picked.length, 2);
    assert.ok(totalMinutes(picked) <= 60);
  });

  test("budget too small for any task → empty plan (never negative/over)", () => {
    const picked = selectTodayPlan([task("a", "Q1", 90)], { maxTasks: 5, availableHours: 0.5 });
    assert.equal(picked.length, 0);
    assert.equal(totalMinutes(picked), 0);
  });

  test("non-positive / NaN hours are treated as no budget", () => {
    const cands = [task("a", "Q1", 600), task("b", "Q2", 600)];
    for (const h of [0, -3, NaN]) {
      const picked = selectTodayPlan(cands, { maxTasks: 5, availableHours: h });
      assert.equal(picked.length, 2, `hours=${h} should behave as unbudgeted`);
    }
  });

  test("does not mutate the input array order", () => {
    const cands = [task("a", "Q3", 30), task("b", "Q1", 30)];
    const snapshot = cands.map((t) => t.id);
    selectTodayPlan(cands, { maxTasks: 5, availableHours: null });
    assert.deepEqual(cands.map((t) => t.id), snapshot);
  });
});

describe("planner · effectiveBudgetHours (#172 V2 — calendar-aware)", () => {
  test("no stated budget → null (busy alone never creates one)", () => {
    assert.equal(effectiveBudgetHours(null, 2), null);
    assert.equal(effectiveBudgetHours(undefined, 2), null);
    assert.equal(effectiveBudgetHours(0, 2), null);
    assert.equal(effectiveBudgetHours(-1, 2), null);
    assert.equal(effectiveBudgetHours(NaN, 2), null);
  });

  test("busy hours are subtracted from the stated budget", () => {
    assert.equal(effectiveBudgetHours(6, 2), 4);
    assert.equal(effectiveBudgetHours(3, 1.5), 1.5);
  });

  test("no/invalid busy → full stated budget", () => {
    assert.equal(effectiveBudgetHours(5, 0), 5);
    assert.equal(effectiveBudgetHours(5, null), 5);
    assert.equal(effectiveBudgetHours(5, undefined), 5);
    assert.equal(effectiveBudgetHours(5, -2), 5);
    assert.equal(effectiveBudgetHours(5, NaN), 5);
  });

  test("fully booked (busy ≥ available) → 0, never negative", () => {
    assert.equal(effectiveBudgetHours(2, 2), 0);
    assert.equal(effectiveBudgetHours(2, 5), 0);
  });

  test("feeds selectTodayPlan: a 4h day with 3h of meetings fits only ~1h of tasks", () => {
    const cands = [task("a", "Q1", 60), task("b", "Q2", 60), task("c", "Q3", 60)];
    const effective = effectiveBudgetHours(4, 3); // 1h free
    const picked = selectTodayPlan(cands, { maxTasks: 5, availableHours: effective });
    assert.equal(picked.length, 1, "only one 60-min task fits the 1h left after meetings");
    assert.equal(picked[0].id, "a", "highest priority within budget");
  });
});
