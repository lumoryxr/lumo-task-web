/**
 * API · Global request body-size limit
 *   Oversized bodies are rejected at the edge (before JSON parse / Zod) with a
 *   413 PAYLOAD_TOO_LARGE, on both the default (2 MB) and bulk (32 MB) tiers.
 *   Normal-size writes are unaffected.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, signInDemo } from "../helpers/index.js";
import { BODY_LIMIT_DEFAULT, BODY_LIMIT_BULK } from "../../lib/bodyLimit.js";

let demoToken = "";

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
});

describe("Body-size limit", () => {
  test("413 → oversized body on a normal write route is rejected", async () => {
    const oversized = "x".repeat(BODY_LIMIT_DEFAULT + 1024);
    const { status, body } = await req("POST", "/v1/countdowns", {
      token: demoToken,
      body: { title: "x", date: "2026-09-09", color: "red", repeat: "none", note: oversized },
    });
    assert.equal(status, 413);
    assert.equal((body as any).error?.code, "PAYLOAD_TOO_LARGE");
  });

  test("bulk /migrate accepts a body larger than the default tier", async () => {
    // A body > the 2 MB default that a normal route would reject must be
    // allowed on the bulk tier. It reaches validation (may 400 on schema), but
    // must never be a 413.
    const filler = "x".repeat(BODY_LIMIT_DEFAULT + 1024 * 1024); // ~3 MB
    const { status } = await req("POST", "/v1/countdowns/migrate", {
      token: demoToken,
      body: { events: [], _filler: filler },
    });
    assert.notEqual(status, 413);
  });

  test("413 → oversized body even on a bulk route is rejected", async () => {
    const huge = "x".repeat(BODY_LIMIT_BULK + 1024);
    const { status, body } = await req("POST", "/v1/countdowns/migrate", {
      token: demoToken,
      body: { events: [], _filler: huge },
    });
    assert.equal(status, 413);
    assert.equal((body as any).error?.code, "PAYLOAD_TOO_LARGE");
  });

  test("a normal-size write is unaffected (no false positive)", async () => {
    const { status } = await req("POST", "/v1/countdowns", {
      token: demoToken,
      body: { title: "Launch day", date: "2026-12-01", color: "cyan", repeat: "yearly" },
    });
    assert.equal(status, 201);
  });

  test("201 → a schema-valid large CJK `content` write is NOT rejected (byte vs char)", async () => {
    // `content` is capped at 1_000_000 *chars*; 1M CJK chars is ~3 MB UTF-8.
    // The byte-based limit must clear that so a write the schema accepts isn't
    // wrongly 413'd — the exact regression a 2 MB default would have caused.
    const content = "中".repeat(1_000_000);
    const { status } = await req("POST", "/v1/projects", {
      token: demoToken,
      body: { name: "Big CJK note", color: "cyan", content },
    });
    assert.equal(status, 201);
  });
});
