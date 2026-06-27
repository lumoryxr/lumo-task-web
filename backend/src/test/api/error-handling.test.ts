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

describe("Schema validation → canonical VALIDATION_ERROR envelope", () => {
  test("a wrong-shape body returns the standard envelope, not the raw zValidator shape", async () => {
    const res = await app.request("/v1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 12345 }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    // Must be our envelope, NOT zValidator's `{ success:false, error:{issues} }`.
    assert.equal(body.success, undefined, "must not leak the raw zValidator shape");
    assert.equal(body.error?.code, "VALIDATION_ERROR");
  });

  test("the message is complete and specific — it names the offending field", async () => {
    const res = await app.request("/v1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 12345 }),
    });
    const body = (await res.json()) as any;
    assert.equal(typeof body.error?.message, "string");
    assert.ok(body.error.message.length > 0, "message must not be empty");
    assert.match(body.error.message, /title/, "message should name the offending field");
  });

  test("structured `fields` detail accompanies the message for inline form display", async () => {
    const res = await app.request("/v1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 12345 }),
    });
    const body = (await res.json()) as any;
    assert.ok(Array.isArray(body.error?.fields), "fields[] must be present");
    assert.ok(body.error.fields.length >= 1);
    const f = body.error.fields[0];
    assert.equal(typeof f.path, "string");
    assert.equal(typeof f.message, "string");
    assert.match(f.path, /title/);
  });
});
