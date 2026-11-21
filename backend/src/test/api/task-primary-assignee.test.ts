/**
 * API · Primary assignee
 *   A task's assignee_ids are ordered: the first is the primary assignee
 *   (主责任人). The order must round-trip exactly, and a person may appear once.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { TaskWireSchema, primaryAssigneeId } from "@lumo/contracts";
import { req, setupDb, newUserWithToken } from "../helpers/index.js";

let token = "";

before(async () => {
  await setupDb();
  ({ token } = await newUserWithToken("primary-assignee"));
});

describe("primary assignee", () => {
  test("201 → assignee order is kept on create and read, so the primary survives", async () => {
    const r = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "Ship" }, assignee_ids: ["p_bo", "p_ann", "p_cy"] },
    });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.assignee_ids, ["p_bo", "p_ann", "p_cy"]);
    TaskWireSchema.parse(r.body);

    const list = await req("GET", "/v1/tasks", { token });
    const got = (list.body.items ?? list.body).find((t: any) => t.id === r.body.id);
    assert.equal(primaryAssigneeId(got.assignee_ids), "p_bo");
  });

  test("200 → PATCH reordering assignees changes the primary", async () => {
    const created = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "Review" }, assignee_ids: ["p_ann", "p_bo"] },
    });
    const r = await req("PATCH", `/v1/tasks/${created.body.id}`, { token, body: { assignee_ids: ["p_bo", "p_ann"] } });
    assert.equal(r.status, 200);
    assert.equal(primaryAssigneeId(r.body.assignee_ids), "p_bo");
  });

  test("400 → the same person twice is rejected", async () => {
    const r = await req("POST", "/v1/tasks", {
      token,
      body: { title: { en: "Dup" }, assignee_ids: ["p_ann", "p_ann"] },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "VALIDATION_ERROR");
  });
});

describe("primary assignee · deleting a person", () => {
  test("204 → deleting the primary promotes the next assignee, order kept", async () => {
    const mk = async (name: string) => {
      const r = await req("POST", "/v1/people", { token, body: { name, initials: name.slice(0, 2), color: "#5bc8d4" } });
      assert.equal(r.status, 201);
      return r.body.id as string;
    };
    const [ann, bo, cy] = [await mk("Ann"), await mk("Bo"), await mk("Cy")];
    const task = await req("POST", "/v1/tasks", { token, body: { title: { en: "Team" }, assignee_ids: [ann, bo, cy] } });
    const del = await req("DELETE", `/v1/people/${ann}`, { token });
    assert.equal(del.status, 204);
    const list = await req("GET", "/v1/tasks", { token });
    const got = (list.body.items ?? list.body).find((t: any) => t.id === task.body.id);
    assert.deepEqual(got.assignee_ids, [bo, cy]);
    assert.equal(primaryAssigneeId(got.assignee_ids), bo);
  });
});
