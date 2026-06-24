/**
 * Unit · keyset cursor codec (lib/cursor)
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { encodeCursor, decodeCursor, InvalidCursorError } from "../../lib/cursor.js";

describe("lib/cursor", () => {
  test("round-trips a position", () => {
    const pos = { createdAt: "2026-06-24T10:00:00.000Z", id: "t_abc123" };
    const round = decodeCursor(encodeCursor(pos));
    assert.deepEqual(round, pos);
  });

  test("produces an opaque (non-plaintext) token", () => {
    const tok = encodeCursor({ createdAt: "2026-06-24T10:00:00.000Z", id: "t_x" });
    assert.doesNotMatch(tok, /2026-06-24|t_x/);
  });

  test("rejects malformed cursors", () => {
    for (const bad of ["", "!!!notbase64!!!", Buffer.from("only-one-part").toString("base64url"), Buffer.from("a\x00").toString("base64url")]) {
      assert.throws(() => decodeCursor(bad), InvalidCursorError);
    }
  });
});
