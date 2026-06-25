/**
 * API · Global error handling (app.onError)
 *
 * Guards the contract that client-side faults never surface as 5xx:
 *   • A malformed JSON request body → 400 INVALID_JSON (Hono raises
 *     HTTPException(400) from the validator; onError must honor it rather than
 *     collapsing it into a 500).
 *
 * Fast in-process counterpart to the DFX integration suite, so this regression
 * is caught on every PR — not just in the daily integration run.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { app } from "../../app.js";
import { setupDb, newUserWithToken } from "../helpers/index.js";

let token = "";

before(async () => {
  await setupDb();
  ({ token } = await newUserWithToken("errh"));
});

describe("Global error handling — malformed JSON body", () => {
  test("POST with invalid JSON → 400 INVALID_JSON, not 500", async () => {
    const res = await app.request("/v1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: "{ not valid json ",
    });
    assert.equal(res.status, 400, "malformed JSON must be a client error, never 5xx");
    const body = (await res.json()) as any;
    assert.equal(body.error?.code, "INVALID_JSON");
    assert.equal(typeof body.error?.message, "string");
  });

  test("POST with a valid-but-wrong-shape body still validates → 400 (sanity)", async () => {
    const res = await app.request("/v1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 12345 }),
    });
    assert.equal(res.status, 400);
  });
});
