/**
 * AC6 — HLC monotonicity & total order (ADR-0004 Addendum; P1a FR4).
 *
 * The Hybrid Logical Clock must never go backwards across calls — even when the
 * injected wall clock stalls (equal reading) or jumps backwards — and two
 * independent generators' timestamps must be totally ordered by string compare.
 *
 * This is a pure unit test (no DB), but it lives under test/api so it runs in
 * the `npm test` gate alongside the round-trip suite.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { now, compare, format, MIN_HLC, __resetForTest } from "../../lib/hlc.js";

describe("AC6 · HLC", () => {
  beforeEach(() => __resetForTest());

  test("format produces a sortable ISO-8601 string with 6 fractional digits", () => {
    const s = format(Date.parse("2026-06-26T10:53:34.326Z"), 1);
    assert.equal(s, "2026-06-26T10:53:34.326001Z");
    // Still a valid ISO timestamp a frontend can parse (sub-ms truncated).
    assert.equal(new Date(s).toISOString(), "2026-06-26T10:53:34.326Z");
  });

  test("MIN_HLC is the lexicographic minimum", () => {
    assert.equal(MIN_HLC, "1970-01-01T00:00:00.000000Z");
    assert.ok(compare(MIN_HLC, format(Date.now(), 0)) < 0);
  });

  test("strictly increasing when wall clock advances", () => {
    const a = now(1_000);
    const b = now(2_000);
    assert.ok(compare(a, b) < 0);
  });

  test("never goes backwards across equal wall-clock readings", () => {
    const seen: string[] = [];
    for (let i = 0; i < 1000; i++) seen.push(now(5_000)); // same physical ms each call
    for (let i = 1; i < seen.length; i++) {
      assert.ok(compare(seen[i - 1], seen[i]) < 0, `not strictly increasing at ${i}`);
    }
  });

  test("never goes backwards when the wall clock jumps BACKWARD", () => {
    const a = now(10_000);
    const b = now(9_000); // clock moved backwards
    const c = now(9_500); // still behind the high-water mark
    assert.ok(compare(a, b) < 0, "backward clock must still advance HLC");
    assert.ok(compare(b, c) < 0, "must keep advancing");
  });

  test("counter overflow carries into the next millisecond", () => {
    // 1001 calls at the same physical ms: counter 0..999 then carry to ms+1.
    let prev = now(7_000);
    for (let i = 0; i < 1001; i++) {
      const next = now(7_000);
      assert.ok(compare(prev, next) < 0, `monotonic across overflow at ${i}`);
      prev = next;
    }
  });

  test("two generators are totally ordered by string compare", () => {
    // Simulate two nodes by capturing values; any two distinct HLCs compare
    // deterministically and consistently (string order == time order).
    __resetForTest();
    const nodeA = [now(100), now(100), now(200)];
    __resetForTest();
    const nodeB = [now(150), now(150), now(250)];
    const all = [...nodeA, ...nodeB];
    // Sorting is stable & total: no two values are "incomparable".
    const sorted = [...all].sort(compare);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(compare(sorted[i - 1], sorted[i]) <= 0);
    }
  });
});
