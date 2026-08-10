import { z } from "zod";

/**
 * Feedback contract — single source of truth for the `/v1/feedback` and
 * `/v1/admin/feedback` protocol.
 *
 * In-app feedback lets any signed-in user send a message (bug / idea / question /
 * other). An operator (an account whose email is in the `LUMO_ADMIN_EMAILS`
 * allow-list) reviews all feedback from the app's admin surface, moves each item
 * through a status, and writes a reply the submitter sees on their own feedback
 * list. This runs alongside — not instead of — the public GitHub Issues link.
 *
 * Two wire shapes: `FeedbackWire` is what a user sees for their OWN feedback
 * (no submitter identity — it's theirs). `AdminFeedbackWire` extends it with the
 * `submitter` block, returned only from the admin endpoints.
 */

// ── Enums ─────────────────────────────────────────────────────────────────────

export const FeedbackCategorySchema = z.enum(["bug", "idea", "question", "other"]);
export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>;

// Lifecycle: open → in_progress → resolved (or closed/won't-fix). `closed` is the
// terminal "no further action" state; `resolved` means shipped/answered.
export const FeedbackStatusSchema = z.enum(["open", "in_progress", "resolved", "closed"]);
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;

// ── Request bodies ──────────────────────────────────────────────────────────────

export const CreateFeedbackBodySchema = z.object({
  // Trimmed first so a whitespace-only message is rejected by min(1).
  message: z.string().trim().min(1).max(4000),
  category: FeedbackCategorySchema.default("other"),
});
export type CreateFeedbackInput = z.input<typeof CreateFeedbackBodySchema>;

// Admin update — the object shape (exported for OpenAPI generation, which does
// not understand the refined wrapper below).
export const UpdateFeedbackObjectSchema = z.object({
  status: FeedbackStatusSchema.optional(),
  // `null` clears a previously written reply; a string sets it.
  response: z.string().trim().max(4000).nullable().optional(),
});

// The validated body: at least one of status/response must be present, so an
// empty PATCH is a clean 400 instead of a no-op success.
export const UpdateFeedbackBodySchema = UpdateFeedbackObjectSchema.refine(
  (b) => b.status !== undefined || b.response !== undefined,
  { message: "Provide at least one of status or response" },
);
export type UpdateFeedbackInput = z.input<typeof UpdateFeedbackBodySchema>;

// ── Wire responses ──────────────────────────────────────────────────────────────

export const FeedbackWireSchema = z.object({
  id: z.string(),
  message: z.string(),
  category: FeedbackCategorySchema,
  status: FeedbackStatusSchema,
  // The operator's reply, or null until one is written.
  response: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type FeedbackWire = z.infer<typeof FeedbackWireSchema>;

// Admin view adds who submitted it. `email` is nullable (username-only accounts).
export const AdminFeedbackWireSchema = FeedbackWireSchema.extend({
  submitter: z.object({
    user_id: z.string(),
    email: z.string().nullable(),
    name: z.string(),
  }),
});
export type AdminFeedbackWire = z.infer<typeof AdminFeedbackWireSchema>;

// GET /v1/feedback → the caller's own feedback + whether they may administer.
// `isAdmin` drives the frontend's reveal of the admin surface without a second
// round-trip.
export const FeedbackListResponseSchema = z.object({
  feedback: z.array(FeedbackWireSchema),
  isAdmin: z.boolean(),
});
export type FeedbackListResponse = z.infer<typeof FeedbackListResponseSchema>;

// POST /v1/feedback → the created item.
export const CreateFeedbackResponseSchema = z.object({
  feedback: FeedbackWireSchema,
});
export type CreateFeedbackResponse = z.infer<typeof CreateFeedbackResponseSchema>;

// GET /v1/admin/feedback → every item, newest first.
export const AdminFeedbackListResponseSchema = z.object({
  feedback: z.array(AdminFeedbackWireSchema),
});
export type AdminFeedbackListResponse = z.infer<typeof AdminFeedbackListResponseSchema>;

// PATCH /v1/admin/feedback/:id → the updated item.
export const AdminFeedbackUpdateResponseSchema = z.object({
  feedback: AdminFeedbackWireSchema,
});
export type AdminFeedbackUpdateResponse = z.infer<typeof AdminFeedbackUpdateResponseSchema>;
