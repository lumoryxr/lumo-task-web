import { z } from "zod";

/**
 * Habit contract — single source of truth for the `/v1/habits` protocol.
 *
 * Covers the habit definition, its completion log (one row per habit per
 * completed day), and the bulk `/migrate` import used when a local-only account
 * moves to the cloud.
 */

export const HabitColorSchema = z.enum(["green", "cyan", "amber", "red", "purple"]);

export const HabitFrequencySchema = z.enum([
  "daily",
  "weekdays",
  "weekend",
  "days_of_week",
  "times_per_week",
  "interval",
]);

/** ISO calendar day, `YYYY-MM-DD`. The habit log's natural key alongside habitId. */
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ── Request bodies ────────────────────────────────────────────────────────────

export const HabitCreateBodySchema = z.object({
  /** Optional client-generated id (offline-first, ADR-0003 Phase 4). */
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  title: z.string().min(1).max(200),
  emoji: z.string().max(10).optional().nullable(),
  color: HabitColorSchema.default("green"),
  frequency: HabitFrequencySchema.default("daily"),
  /** Weekday indices (0 = Sunday … 6 = Saturday), used when frequency = days_of_week. */
  frequencyDays: z.array(z.number().int().min(0).max(6)).max(7).optional().nullable(),
  /** Target completions per week, used when frequency = times_per_week. */
  frequencyTimes: z.number().int().min(1).max(7).optional().nullable(),
  /** Days between occurrences, used when frequency = interval. */
  frequencyInterval: z.number().int().min(2).max(30).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

export const HabitUpdateBodySchema = HabitCreateBodySchema.partial();

/** POST /v1/habits/:id/log — mark the habit done on a given calendar day. */
export const HabitLogBodySchema = z.object({
  date: IsoDateSchema,
});

/**
 * Bulk-import arrays are bounded so a single /migrate call can't force
 * unbounded memory/CPU. Caps sit well above any realistic export — a heavy user
 * has dozens of habits, and `logs` is high-cardinality (one row per habit per
 * completed day, so years of daily habits still fit under 200k) — so no genuine
 * migration is rejected; only pathological payloads are.
 */
export const MIGRATE_MAX_HABITS = 10_000;
export const MIGRATE_MAX_HABIT_LOGS = 200_000;

export const HabitMigrateBodySchema = z.object({
  habits: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        title: z.string().min(1).max(200),
        emoji: z.string().max(10).optional().nullable(),
        color: HabitColorSchema,
        frequency: HabitFrequencySchema,
        frequencyDays: z.array(z.number().int().min(0).max(6)).max(7).optional().nullable(),
        frequencyTimes: z.number().optional().nullable(),
        frequencyInterval: z.number().optional().nullable(),
        note: z.string().optional().nullable(),
        createdAt: z.string(),
      }),
    )
    .max(MIGRATE_MAX_HABITS),
  logs: z
    .array(
      z.object({
        habitId: z.string().min(1).max(64),
        date: IsoDateSchema,
        completedAt: z.string(),
      }),
    )
    .max(MIGRATE_MAX_HABIT_LOGS),
});

// ── Wire responses ────────────────────────────────────────────────────────────

export const HabitWireSchema = z.object({
  id: z.string(),
  title: z.string(),
  emoji: z.string().optional(),
  color: z.string(),
  frequency: z.string(),
  frequencyDays: z.array(z.number()).optional(),
  frequencyTimes: z.number().optional(),
  frequencyInterval: z.number().optional(),
  note: z.string().optional(),
  createdAt: z.string(),
});

export const HabitLogWireSchema = z.object({
  habitId: z.string(),
  date: z.string(),
  completedAt: z.string(),
});

/** GET /v1/habits — keyset-paginated by (created_at ASC, id ASC). */
export const HabitListResponseSchema = z.object({
  items: z.array(HabitWireSchema),
  nextCursor: z.string().nullable(),
});

export const HabitMigrateResponseSchema = z.object({
  ok: z.literal(true),
  migrated: z.object({
    habits: z.number(),
    logs: z.number(),
  }),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type HabitColor = z.infer<typeof HabitColorSchema>;
export type HabitFrequency = z.infer<typeof HabitFrequencySchema>;
export type HabitCreateInput = z.input<typeof HabitCreateBodySchema>;
export type HabitUpdateInput = z.input<typeof HabitUpdateBodySchema>;
export type HabitMigrateInput = z.input<typeof HabitMigrateBodySchema>;
export type HabitWire = z.infer<typeof HabitWireSchema>;
export type HabitLogWire = z.infer<typeof HabitLogWireSchema>;
export type HabitListResponse = z.infer<typeof HabitListResponseSchema>;
