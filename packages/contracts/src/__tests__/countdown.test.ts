import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CountdownWireSchema,
  CountdownListResponseSchema,
} from "../countdown.js";

const WIRE = {
  id: "cd_1",
  title: "Launch",
  date: "2026-12-31",
  emoji: "🚀",
  color: "green",
  repeat: "none",
  note: "big day",
  calendar: "solar",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("CountdownWireSchema", () => {
  test("parses a full wire row", () => {
    assert.equal(CountdownWireSchema.safeParse(WIRE).success, true);
  });

  test("allows omitted emoji/note (undefined, as rowToEvent emits when unset)", () => {
    const { emoji, note, ...rest } = WIRE;
    void emoji; void note;
    assert.equal(CountdownWireSchema.safeParse(rest).success, true);
  });

  test("rejects a row missing createdAt", () => {
    const { createdAt, ...rest } = WIRE;
    void createdAt;
    assert.equal(CountdownWireSchema.safeParse(rest).success, false);
  });
});

describe("CountdownListResponseSchema", () => {
  test("parses a page with items + a string nextCursor", () => {
    const r = CountdownListResponseSchema.safeParse({ items: [WIRE], nextCursor: "abc" });
    assert.equal(r.success, true);
  });

  test("parses a last page with a null nextCursor", () => {
    const r = CountdownListResponseSchema.safeParse({ items: [], nextCursor: null });
    assert.equal(r.success, true);
  });

  test("rejects a bare array (the pre-pagination shape)", () => {
    assert.equal(CountdownListResponseSchema.safeParse([WIRE]).success, false);
  });

  test("rejects a missing nextCursor", () => {
    assert.equal(CountdownListResponseSchema.safeParse({ items: [WIRE] }).success, false);
  });
});
