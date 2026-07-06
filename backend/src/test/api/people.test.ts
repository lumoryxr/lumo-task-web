/**
 * API · People
 *   GET /v1/people · POST · PATCH /:id · DELETE /:id
 *   (DELETE cascades: removes the person from every task's assignee_ids)
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { PersonWireSchema, PersonListResponseSchema } from "@lumo/contracts";
import { req, setupDb, signInDemo, newUserWithToken } from "../helpers/index.js";

let demoToken = "";
let personId = ""; // reused across the CRUD flow within this file

before(async () => {
  await setupDb();
  ({ token: demoToken } = await signInDemo());
});

describe("GET /v1/people", () => {
  test("200 → returns a keyset page { items, nextCursor }", async () => {
    const { status, body } = await req("GET", "/v1/people", { token: demoToken });
    assert.equal(status, 200);
    const parsed = PersonListResponseSchema.parse(body); // contract conformance
    assert.ok(Array.isArray(parsed.items));
  });

  test("401 → no token", async () => {
    const { status } = await req("GET", "/v1/people");
    assert.equal(status, 401);
  });

  test("400 → malformed cursor is rejected", async () => {
    const { status, body } = await req("GET", "/v1/people?cursor=not-a-valid-cursor%00%00", { token: demoToken });
    assert.equal(status, 400);
    assert.equal((body as any).error?.code, "INVALID_CURSOR");
  });

  test("pages through with limit + cursor, in stable created_at ASC order, no dupes/gaps", async () => {
    // Fresh isolated user so the count is deterministic.
    const { token } = await newUserWithToken();
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { body } = await req("POST", "/v1/people", {
        token,
        body: { name: `Person ${i}`, initials: "PX", color: "#5bc8d4" },
      });
      created.push(body.id);
    }

    // Walk pages of size 2 and accumulate.
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const path: string = cursor
        ? `/v1/people?limit=2&cursor=${encodeURIComponent(cursor)}`
        : "/v1/people?limit=2";
      const { status, body } = await req("GET", path, { token });
      assert.equal(status, 200);
      const parsed = PersonListResponseSchema.parse(body);
      assert.ok(parsed.items.length <= 2, "page must respect the limit");
      for (const p of parsed.items) seen.push(p.id);
      cursor = parsed.nextCursor;
      pages += 1;
      assert.ok(pages <= 10, "must terminate");
    } while (cursor);

    assert.equal(seen.length, 5, "every person appears exactly once across pages");
    assert.equal(new Set(seen).size, 5, "no duplicates across pages");
    // created_at ASC == creation order for these sequential inserts.
    assert.deepEqual(seen, created, "stable creation order across pages");
  });

  test("limit is capped at MAX_LIMIT (over-max does not error)", async () => {
    const { status, body } = await req("GET", "/v1/people?limit=99999", { token: demoToken });
    assert.equal(status, 200);
    PersonListResponseSchema.parse(body);
  });
});

describe("POST /v1/people", () => {
  test("201 → creates person with all fields", async () => {
    const { status, body } = await req("POST", "/v1/people", {
      token: demoToken,
      body: { name: "Alice Smith", initials: "AS", color: "#5bc8d4", email: "alice@example.com" },
    });
    assert.equal(status, 201);
    assert.equal(body.name, "Alice Smith");
    assert.equal(body.initials, "AS");
    assert.equal(body.color, "#5bc8d4");
    assert.equal(body.email, "alice@example.com");
    assert.ok(body.id, "id missing");
    PersonWireSchema.parse(body); // contract conformance
    personId = body.id;
  });

  test("201 → creates person without optional email", async () => {
    const { status, body } = await req("POST", "/v1/people", {
      token: demoToken,
      body: { name: "No Email", initials: "NE", color: "#a8e64b" },
    });
    assert.equal(status, 201);
    assert.equal(body.email, null);
  });

  test("400 → invalid hex color", async () => {
    const { status } = await req("POST", "/v1/people", {
      token: demoToken,
      body: { name: "Bad Color", initials: "BC", color: "red" },
    });
    assert.equal(status, 400);
  });

  test("400 → initials longer than 2 characters", async () => {
    const { status } = await req("POST", "/v1/people", {
      token: demoToken,
      body: { name: "Long Initials", initials: "LII", color: "#ffffff" },
    });
    assert.equal(status, 400);
  });

  test("401 → no token", async () => {
    const { status } = await req("POST", "/v1/people", {
      body: { name: "No Auth", initials: "NA", color: "#ffffff" },
    });
    assert.equal(status, 401);
  });
});

describe("PATCH /v1/people/:id", () => {
  test("200 → partial update", async () => {
    const { status, body } = await req("PATCH", `/v1/people/${personId}`, {
      token: demoToken,
      body: { name: "Alice Updated" },
    });
    assert.equal(status, 200);
    assert.equal(body.name, "Alice Updated");
    assert.equal(body.initials, "AS", "initials should be unchanged");
  });

  test("200 → can update email to null", async () => {
    const { status, body } = await req("PATCH", `/v1/people/${personId}`, {
      token: demoToken,
      body: { email: null },
    });
    assert.equal(status, 200);
    assert.equal(body.email, null);
  });

  test("404 → unknown id", async () => {
    const { status } = await req("PATCH", "/v1/people/nonexistent-id", {
      token: demoToken,
      body: { name: "Ghost" },
    });
    assert.equal(status, 404);
  });

  test("401 → no token", async () => {
    const { status } = await req("PATCH", `/v1/people/${personId}`, {
      body: { name: "No auth" },
    });
    assert.equal(status, 401);
  });
});

describe("DELETE /v1/people/:id", () => {
  test("204 → deletes person and removes them from assignee_ids on tasks", async () => {
    const { body: task } = await req("POST", "/v1/tasks", {
      token: demoToken,
      body: { title: { en: "Assigned task" }, assignee_ids: [personId] },
    });
    assert.deepEqual(task.assignee_ids, [personId], "task should have assignee");

    const { status } = await req("DELETE", `/v1/people/${personId}`, { token: demoToken });
    assert.equal(status, 204);

    const { body: updatedTask } = await req("GET", `/v1/tasks/${task.id}`, { token: demoToken });
    assert.deepEqual(updatedTask.assignee_ids, [], "assignee should be removed after person deleted");

    await req("DELETE", `/v1/tasks/${task.id}`, { token: demoToken });
  });

  test("404 → unknown id", async () => {
    const { status } = await req("DELETE", "/v1/people/nonexistent-id", { token: demoToken });
    assert.equal(status, 404);
  });

  test("401 → no token", async () => {
    const { status } = await req("DELETE", `/v1/people/${personId}`);
    assert.equal(status, 401);
  });
});
