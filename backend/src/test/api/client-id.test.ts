/**
 * Client-generated ids on create (ADR-0003 Phase 4b — offline-first).
 *
 * A client can supply the entity id on create so an offline-created row has a
 * stable id before it syncs; combined with the Idempotency-Key, the queued
 * create replays without duplicating.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";

let token = "";

before(async () => {
  await setupDb();
  ({ token } = await newUserWithToken("cid"));
});

describe("Client-generated ids", () => {
  test("POST /tasks honors a valid client id", async () => {
    const id = "t_clientGenerated1";
    const { status, body } = await req("POST", "/v1/tasks", {
      token,
      body: { id, title: { en: "offline task" }, quadrant: "Q1" },
    });
    assert.equal(status, 201);
    assert.equal(body.id, id, "server must use the client-provided id");
    // It's the real row — fetchable by that id.
    assert.equal((await req("GET", `/v1/tasks/${id}`, { token })).status, 200);
  });

  test("an invalid client id is rejected (400)", async () => {
    const { status } = await req("POST", "/v1/tasks", {
      token,
      body: { id: "bad id!", title: { en: "x" }, quadrant: "Q1" },
    });
    assert.equal(status, 400);
  });

  test("client id + Idempotency-Key replay creates exactly one row", async () => {
    const id = "t_offlineCreate9";
    const headers = { "Idempotency-Key": "queue-replay-1" };
    const body = { id, title: { en: "queued" }, quadrant: "Q2" };
    const r1 = await req("POST", "/v1/tasks", { token, body, headers });
    const r2 = await req("POST", "/v1/tasks", { token, body, headers });
    assert.equal(r1.body.id, id);
    assert.equal(r2.body.id, id, "replay returns the same row");
    // Only one row exists with that id.
    assert.equal((await req("GET", `/v1/tasks/${id}`, { token })).status, 200);
  });

  test("people / habits / countdowns honor client ids too", async () => {
    const p = await req("POST", "/v1/people", { token, body: { id: "p_clientP1", name: "P", initials: "PP", color: "#5bc8d4" } });
    assert.equal(p.body.id, "p_clientP1");
    const h = await req("POST", "/v1/habits", { token, body: { id: "habit_clientH1", title: "H", color: "green", frequency: "daily" } });
    assert.equal(h.body.id, "habit_clientH1");
    const c = await req("POST", "/v1/countdowns", { token, body: { id: "cd_clientC1", title: "C", date: "2026-12-01", color: "cyan", repeat: "none" } });
    assert.equal(c.body.id, "cd_clientC1");
  });
});
