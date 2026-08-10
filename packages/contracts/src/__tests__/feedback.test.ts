import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CreateFeedbackBodySchema,
  UpdateFeedbackBodySchema,
  FeedbackWireSchema,
  AdminFeedbackWireSchema,
  FeedbackListResponseSchema,
  FeedbackStatusSchema,
  FeedbackCategorySchema,
} from "../feedback.js";

describe("CreateFeedbackBodySchema", () => {
  test("defaults category to 'other' when omitted", () => {
    const b = CreateFeedbackBodySchema.parse({ message: "hello" });
    assert.equal(b.category, "other");
    assert.equal(b.message, "hello");
  });

  test("trims the message and rejects whitespace-only", () => {
    assert.equal(CreateFeedbackBodySchema.parse({ message: "  hi  " }).message, "hi");
    assert.throws(() => CreateFeedbackBodySchema.parse({ message: "   " }));
    assert.throws(() => CreateFeedbackBodySchema.parse({ message: "" }));
  });

  test("rejects an over-long message (>4000) and an unknown category", () => {
    assert.throws(() => CreateFeedbackBodySchema.parse({ message: "x".repeat(4001) }));
    assert.throws(() => CreateFeedbackBodySchema.parse({ message: "x", category: "praise" }));
  });
});

describe("UpdateFeedbackBodySchema", () => {
  test("accepts a status-only, a response-only, and both", () => {
    assert.equal(UpdateFeedbackBodySchema.parse({ status: "resolved" }).status, "resolved");
    assert.equal(UpdateFeedbackBodySchema.parse({ response: "thanks!" }).response, "thanks!");
    const both = UpdateFeedbackBodySchema.parse({ status: "closed", response: "done" });
    assert.equal(both.status, "closed");
    assert.equal(both.response, "done");
  });

  test("accepts response: null to clear a reply", () => {
    assert.equal(UpdateFeedbackBodySchema.parse({ response: null }).response, null);
  });

  test("rejects an empty patch (neither status nor response)", () => {
    assert.throws(() => UpdateFeedbackBodySchema.parse({}));
  });

  test("rejects an unknown status", () => {
    assert.throws(() => UpdateFeedbackBodySchema.parse({ status: "wontfix" }));
  });
});

describe("FeedbackWireSchema", () => {
  const valid = {
    id: "fb_1",
    message: "It crashed",
    category: "bug",
    status: "open",
    response: null,
    created_at: "2026-08-10T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
  };

  test("accepts a well-formed item and a written response", () => {
    assert.doesNotThrow(() => FeedbackWireSchema.parse(valid));
    assert.doesNotThrow(() => FeedbackWireSchema.parse({ ...valid, response: "fixed in 1.2" }));
  });

  test("rejects an unknown status/category on the wire", () => {
    assert.throws(() => FeedbackWireSchema.parse({ ...valid, status: "archived" }));
    assert.throws(() => FeedbackWireSchema.parse({ ...valid, category: "spam" }));
  });

  test("the user wire carries no submitter identity", () => {
    const parsed = FeedbackWireSchema.parse(valid) as Record<string, unknown>;
    assert.equal("submitter" in parsed, false);
  });
});

describe("AdminFeedbackWireSchema", () => {
  test("requires the submitter block on top of the base wire", () => {
    const base = {
      id: "fb_1",
      message: "m",
      category: "idea",
      status: "in_progress",
      response: null,
      created_at: "2026-08-10T00:00:00.000Z",
      updated_at: "2026-08-10T00:00:00.000Z",
    };
    assert.throws(() => AdminFeedbackWireSchema.parse(base), /submitter/);
    assert.doesNotThrow(() =>
      AdminFeedbackWireSchema.parse({
        ...base,
        submitter: { user_id: "u_1", email: "a@b.com", name: "Ann" },
      }),
    );
    // email may be null for username-only accounts.
    assert.doesNotThrow(() =>
      AdminFeedbackWireSchema.parse({
        ...base,
        submitter: { user_id: "u_1", email: null, name: "Ann" },
      }),
    );
  });
});

describe("FeedbackListResponseSchema", () => {
  test("carries the feedback array and the isAdmin flag", () => {
    const r = FeedbackListResponseSchema.parse({ feedback: [], isAdmin: true });
    assert.deepEqual(r.feedback, []);
    assert.equal(r.isAdmin, true);
  });
});

describe("enum membership", () => {
  test("status and category enums list the expected members", () => {
    assert.deepEqual(FeedbackStatusSchema.options, ["open", "in_progress", "resolved", "closed"]);
    assert.deepEqual(FeedbackCategorySchema.options, ["bug", "idea", "question", "other"]);
  });
});
