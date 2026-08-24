import { z } from "zod";
import { LocalizedStringSchema } from "./primitives.js";

/**
 * AI endpoint contracts — request/response schemas for the `/v1/ai/*` protocol.
 *
 * Contract-First: these are the single source of truth. Backend routes validate
 * with these schemas; frontend types are inferred from them.
 *
 * SECURITY (CLAUDE.md, non-negotiable): the AI surface is a *read-and-suggest*
 * surface. High-risk operations (delete account, change password) are never
 * exposed as AI tools, and the pet/AI tools reach data through the REST API
 * rather than the database directly. Nothing in these shapes carries a
 * credential — provider keys live only in settings and never cross this wire.
 */

// ── POST /v1/ai/breakdown ─────────────────────────────────────────────────────

export const BreakdownRequestSchema = z.object({
  taskId: z.string().min(1),
  locale: z.enum(["en", "zh"]).optional(),
});

export const BreakdownResponseSchema = z.object({
  subtasks: z.array(z.string()),
  cloudLimitReached: z.boolean(),
});

// ── POST /v1/ai/classify ──────────────────────────────────────────────────────
// Takes no input: the server classifies the caller's own unclassified tasks, so
// the body is strictly empty — a stray field is a client bug and is rejected.

export const ClassifyRequestSchema = z.object({}).strict();

export const ClassifySuggestionSchema = z.object({
  task_id: z.string(),
  quadrant: z.string(),
  confidence: z.number(),
  reason: z.string().optional(),
});

export const ClassifyResponseSchema = z.object({
  suggestions: z.array(ClassifySuggestionSchema),
  /** Present only when the shared cloud key hit its monthly free-tier ceiling. */
  cloudLimitReached: z.boolean().optional(),
});

// ── POST /v1/ai/recommend ─────────────────────────────────────────────────────
// Also input-free: recommends the single next task from the caller's own Q1.

export const RecommendRequestSchema = z.object({}).strict();

export const RecommendedTaskSchema = z.object({
  id: z.string(),
  title: LocalizedStringSchema,
  quadrant: z.string(),
  /** Model/heuristic confidence in the pick, 0–1. */
  conviction: z.number(),
  reason: LocalizedStringSchema.optional(),
  next_step: LocalizedStringSchema.optional(),
});

export const RecommendResponseSchema = z.object({
  /** `null` when the caller has no eligible (Q1, incomplete) task. */
  task: RecommendedTaskSchema.nullable(),
});

// ── POST /v1/ai/parse ─────────────────────────────────────────────────────────

export const ParseRequestSchema = z.object({
  text: z.string().min(1).max(500),
  locale: z.enum(["en", "zh"]).optional(),
});

/**
 * Natural-language → structured task. On any LLM failure the route degrades to
 * echoing the raw text with `confidence: 0` rather than erroring, so the
 * quick-add box always produces something the user can edit.
 */
export const ParseResponseSchema = z.object({
  title: z.string(),
  quadrant: z.string(),
  due: z.string().nullable(),
  duration: z.number().nullable(),
  confidence: z.number(),
});

// ── POST /v1/ai/chat ──────────────────────────────────────────────────────────

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(5000),
});

/**
 * Client-supplied situational context for the pet assistant. Every field is
 * bounded (array length + string length) so a malformed or hostile client
 * cannot inflate the prompt sent to the provider.
 */
export const ChatContextSchema = z.object({
  page: z.string().max(200).optional(),
  todayTasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().max(500),
        quadrant: z.string().max(20),
      }),
    )
    .max(50)
    .optional(),
  q1Count: z.number().int().optional(),
  recentCompleted: z
    .array(
      z.object({
        title: z.string().max(500),
        completedAt: z.string(),
      }),
    )
    .max(20)
    .optional(),
  locale: z.enum(["en", "zh"]).optional(),
  userName: z.string().max(100).optional(),
  species: z.enum(["dog", "cat", "fox", "panda", "robot"]).optional(),
  petName: z.string().max(50).optional(),
  /**
   * Hours already booked in the user's imported calendar today. Bounded so a
   * malformed client value can't distort planning; feeds generate_today_plan.
   */
  calendarBusyHours: z.number().nonnegative().max(24).optional(),
});

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).max(20),
  context: ChatContextSchema.optional(),
});

export const ChatResponseSchema = z.object({
  reply: z.string(),
  /** Drives the pet's animation state. */
  mood: z.string(),
  /** True when the reply came from the canned fallback, not a live model. */
  fallback: z.boolean(),
  /** Names of the AI tools invoked while producing this reply. */
  toolsUsed: z.array(z.string()),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type BreakdownRequest = z.infer<typeof BreakdownRequestSchema>;
export type BreakdownResponse = z.infer<typeof BreakdownResponseSchema>;
export type ClassifySuggestion = z.infer<typeof ClassifySuggestionSchema>;
export type ClassifyResponse = z.infer<typeof ClassifyResponseSchema>;
export type RecommendedTask = z.infer<typeof RecommendedTaskSchema>;
export type RecommendResponse = z.infer<typeof RecommendResponseSchema>;
export type ParseRequest = z.infer<typeof ParseRequestSchema>;
export type ParseResponse = z.infer<typeof ParseResponseSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatContext = z.infer<typeof ChatContextSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
