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
