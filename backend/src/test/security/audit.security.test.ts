/**
 * Security · Audit log shape
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { audit } from "../../lib/audit.js";

describe("audit()", () => {
  test("emits one parseable JSON line with the event + fields", () => {
    const orig = console.log;
    let captured = "";
    console.log = (line: unknown) => { captured = String(line); };
    try {
      audit("auth.signin.ok", { userId: "u_test", ip: "1.2.3.4" });
    } finally {
      console.log = orig;
    }
    const obj = JSON.parse(captured);
    assert.equal(obj.audit, "auth.signin.ok");
    assert.equal(obj.userId, "u_test");
    assert.equal(obj.ip, "1.2.3.4");
    assert.ok(obj.ts, "timestamp present");
  });
});
