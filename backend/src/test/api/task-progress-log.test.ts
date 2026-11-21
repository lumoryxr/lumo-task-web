/**
 * API · Task progress log (进展记录)
 *   Dated progress notes stored on the task: create, read, replace via PATCH,
 *   validation, and that a recurring task's next occurrence starts empty.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { TaskWireSchema } from "@lumo/contracts";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";

let token = "";

before(async () => {
  await setupDb();
  ({ token } = await newUserWithToken("progress-log"));
});

const note = (id: string, date: string, text: string) => ({
  id, date, text, created_at: `${date}T09:00:00.000Z`,
});

async function getTask(id: string) {
  const r = await req("GET", `/v1/tasks/${id}`, { token });
  assert.equal(r.status, 200);
  return r.body;
}

describe("task progress log", () => {
  test("201 → a new task has an empty log, contract-conformant", async () => {
    const r = await req("POST", "/v1/tasks", { token, body: { title: { en: "Ship" } } });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.progress_log, []);
    TaskWireSchema.parse(r.body);
  });

  test("200 → PATCH stores the notes and they read back unchanged", async () => {
    const t = await req("POST", "/v1/tasks", { token, body: { title: { en: "Report" } } });
    const log = [note("pn_a", "2026-11-20", "Collected data"), note("pn_b", "2026-11-21", "Wrote the summary")];
    const r = await req("PATCH", `/v1/tasks/${t.body.id}`, { token, body: { progress_log: log } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.progress_log, log);
    TaskWireSchema.parse(r.body);
    assert.deepEqual((await getTask(t.body.id)).progress_log, log);
  });

  test("200 → PATCH of another field leaves the log untouched", async () => {
    const t = await req("POST", "/v1/tasks", {
      token, body: { title: { en: "Keep" }, progress_log: [note("pn_k", "2026-11-21", "Started")] },
    });
    const r = await req("PATCH", `/v1/tasks/${t.body.id}`, { token, body: { progress: 30 } });
    assert.equal(r.body.progress_log.length, 1);
  });

  test("400 → a blank note or a malformed date is rejected", async () => {
    const t = await req("POST", "/v1/tasks", { token, body: { title: { en: "Bad" } } });
    for (const bad of [note("pn_x", "2026-11-21", "   "), note("pn_y", "yesterday", "ok")]) {
      const r = await req("PATCH", `/v1/tasks/${t.body.id}`, { token, body: { progress_log: [bad] } });
      assert.equal(r.status, 400);
      assert.equal(r.body.error.code, "VALIDATION_ERROR");
    }
  });

  test("the next occurrence of a recurring task starts with an empty log", async () => {
    const t = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "Weekly sync" }, recurrence: "weekly", due: "2026-11-21", progress_log: [note("pn_w", "2026-11-21", "Done this week")] },
    });
    const done = await req("POST", `/v1/tasks/${t.body.id}/complete`, { token, body: {} });
    assert.equal(done.status, 200);
    const list = await req("GET", "/v1/tasks", { token });
    const next = (list.body.items ?? list.body).find(
      (x: any) => x.title.en === "Weekly sync" && x.id !== t.body.id,
    );
    assert.ok(next, "next occurrence should exist");
    assert.deepEqual(next.progress_log, []);
  });
});
