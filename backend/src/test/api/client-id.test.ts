/**
 * Client-generated ids on create.
 *
 * A client can supply the entity id on create so an optimistic insert has a
 * stable id before the server round-trip resolves.
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

  test("people / habits / countdowns honor client ids too", async () => {
    const p = await req("POST", "/v1/people", { token, body: { id: "p_clientP1", name: "P", initials: "PP", color: "#5bc8d4" } });
    assert.equal(p.body.id, "p_clientP1");
    const h = await req("POST", "/v1/habits", { token, body: { id: "habit_clientH1", title: "H", color: "green", frequency: "daily" } });
    assert.equal(h.body.id, "habit_clientH1");
    const c = await req("POST", "/v1/countdowns", { token, body: { id: "cd_clientC1", title: "C", date: "2026-12-01", color: "cyan", repeat: "none" } });
    assert.equal(c.body.id, "cd_clientC1");
  });
});
