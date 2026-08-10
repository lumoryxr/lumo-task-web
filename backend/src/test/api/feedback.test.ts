/**
 * API · Feedback (#473 follow-up)
 *   User:  GET /v1/feedback · POST /v1/feedback
 *   Admin: GET /v1/admin/feedback · PATCH /v1/admin/feedback/:id
 * Plus contract conformance, the isAdmin flag, and the reply round-trip.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb, newUserWithToken, expectConforms } from "../helpers/index.js";
import {
  FeedbackListResponseSchema,
  CreateFeedbackResponseSchema,
  AdminFeedbackListResponseSchema,
  AdminFeedbackUpdateResponseSchema,
} from "@lumo/contracts";

let user = { token: "", userId: "", email: "" };
let admin = { token: "", userId: "", email: "" };
const origAdminEmails = process.env.LUMO_ADMIN_EMAILS;

before(async () => {
  await setupDb();
  const u = await newUserWithToken("fbuser");
  user = { token: u.token, userId: u.userId, email: u.email };
  const a = await newUserWithToken("fbadmin");
  admin = { token: a.token, userId: a.userId, email: a.email };
  // Make the second account an operator by putting its email in the allow-list.
  process.env.LUMO_ADMIN_EMAILS = admin.email;
});

after(() => {
  if (origAdminEmails === undefined) delete process.env.LUMO_ADMIN_EMAILS;
  else process.env.LUMO_ADMIN_EMAILS = origAdminEmails;
});

describe("Feedback — submit & list own", () => {
  let feedbackId = "";

  test("401 → unauthenticated GET /v1/feedback", async () => {
    const { status } = await req("GET", "/v1/feedback");
    assert.equal(status, 401);
  });

  test("201 → POST creates feedback, defaults status=open, category applied", async () => {
    const { status, body } = await req("POST", "/v1/feedback", {
      token: user.token,
      body: { message: "The matrix drag is janky", category: "bug" },
    });
    assert.equal(status, 201);
    const parsed = expectConforms(CreateFeedbackResponseSchema, body);
    assert.equal(parsed.feedback.category, "bug");
    assert.equal(parsed.feedback.status, "open");
    assert.equal(parsed.feedback.response, null);
    assert.equal(parsed.feedback.message, "The matrix drag is janky");
    feedbackId = parsed.feedback.id;
  });

  test("category defaults to 'other' when omitted", async () => {
    const { status, body } = await req("POST", "/v1/feedback", {
      token: user.token,
      body: { message: "Would love dark mode variants" },
    });
    assert.equal(status, 201);
    assert.equal(body.feedback.category, "other");
  });

  test("400 → empty/whitespace message rejected with VALIDATION_ERROR", async () => {
    const { status, body } = await req("POST", "/v1/feedback", {
      token: user.token,
      body: { message: "   " },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  test("GET /v1/feedback returns the caller's own items + isAdmin:false", async () => {
    const { status, body } = await req("GET", "/v1/feedback", { token: user.token });
    assert.equal(status, 200);
    const parsed = expectConforms(FeedbackListResponseSchema, body);
    assert.equal(parsed.isAdmin, false);
    assert.ok(parsed.feedback.some((f) => f.id === feedbackId));
    // Newest-first ordering.
    assert.equal(parsed.feedback[0].message, "Would love dark mode variants");
  });

  test("a user never sees another user's feedback", async () => {
    const other = await newUserWithToken("fbother");
    const { body } = await req("GET", "/v1/feedback", { token: other.token });
    assert.equal(body.feedback.length, 0);
  });
});

describe("Feedback — admin queue & reply", () => {
  let targetId = "";

  test("GET /v1/feedback as the admin reports isAdmin:true", async () => {
    const { status, body } = await req("GET", "/v1/feedback", { token: admin.token });
    assert.equal(status, 200);
    assert.equal(body.isAdmin, true);
  });

  test("GET /v1/admin/feedback lists every user's feedback with submitter identity", async () => {
    const { status, body } = await req("GET", "/v1/admin/feedback", { token: admin.token });
    assert.equal(status, 200);
    const parsed = expectConforms(AdminFeedbackListResponseSchema, body);
    assert.ok(parsed.feedback.length >= 2, "sees feedback submitted by the other user");
    const mine = parsed.feedback.find((f) => f.submitter.user_id === user.userId);
    assert.ok(mine, "submitter identity present");
    assert.equal(mine!.submitter.email, user.email);
    targetId = mine!.id;
  });

  test("PATCH sets status and writes a reply the submitter then sees", async () => {
    const { status, body } = await req("PATCH", `/v1/admin/feedback/${targetId}`, {
      token: admin.token,
      body: { status: "resolved", response: "Fixed in the next build — thanks!" },
    });
    assert.equal(status, 200);
    const parsed = expectConforms(AdminFeedbackUpdateResponseSchema, body);
    assert.equal(parsed.feedback.status, "resolved");
    assert.equal(parsed.feedback.response, "Fixed in the next build — thanks!");

    // The original submitter sees the status + reply on their own list.
    const { body: own } = await req("GET", "/v1/feedback", { token: user.token });
    const updated = own.feedback.find((f: { id: string }) => f.id === targetId);
    assert.equal(updated.status, "resolved");
    assert.equal(updated.response, "Fixed in the next build — thanks!");
  });

  test("PATCH with response:null clears the reply", async () => {
    const { status, body } = await req("PATCH", `/v1/admin/feedback/${targetId}`, {
      token: admin.token,
      body: { response: null },
    });
    assert.equal(status, 200);
    assert.equal(body.feedback.response, null);
    // Status is untouched when only response is sent.
    assert.equal(body.feedback.status, "resolved");
  });

  test("400 → empty PATCH (neither status nor response) rejected", async () => {
    const { status, body } = await req("PATCH", `/v1/admin/feedback/${targetId}`, {
      token: admin.token,
      body: {},
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  test("404 → PATCH an unknown feedback id", async () => {
    const { status, body } = await req("PATCH", "/v1/admin/feedback/fb_does_not_exist", {
      token: admin.token,
      body: { status: "closed" },
    });
    assert.equal(status, 404);
    assert.equal(body.error.code, "NOT_FOUND");
  });
});
