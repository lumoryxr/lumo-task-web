import { z } from "zod";

/**
 * Settings contract — single source of truth for the `/v1/settings` protocol.
 *
 * SECURITY (CLAUDE.md, non-negotiable): an AI **API key is never returned** by
 * any endpoint. The wire shape below encodes that rule structurally — each
 * provider config exposes `hasKey: boolean` and never a `key` field — so a
 * response that leaked a key would fail the contract-conformance test rather
 * than silently shipping. Keys travel one-way: in via `ai_configs_update.key`.
 */

export const AiProviderSchema = z.enum(["openai", "deepseek", "claude", "custom"]);
export const LocaleSchema = z.enum(["en", "zh"]);
export const AccentSchema = z.enum(["green", "cyan", "amber", "graphite"]);
export const DensitySchema = z.enum(["comfortable", "compact"]);

/** `HH:MM` 24-hour local time for the morning/evening reminders. */
const ClockTimeSchema = z.string().regex(/^\d{2}:\d{2}$/);

// ── Request body ──────────────────────────────────────────────────────────────

/**
 * PATCH /v1/settings — every field optional; only the keys present are written.
 *
 * `ai_configs_update` is the write-only lane for provider credentials: it
 * updates one provider's key/model/baseUrl at a time. An empty-string or null
 * `key` clears the stored credential.
 */
export const SettingsPatchBodySchema = z.object({
  locale: LocaleSchema.optional(),
  accent: AccentSchema.optional(),
  density: DensitySchema.optional(),
  reduced_motion: z.boolean().optional(),
  ai_enabled: z.boolean().optional(),
  pomodoro_duration: z.number().int().min(1).optional(),
  short_break: z.number().int().min(1).optional(),
  long_break: z.number().int().min(1).optional(),
  long_break_interval: z.number().int().min(1).optional(),
  auto_start_breaks: z.boolean().optional(),
  notifications_enabled: z.boolean().optional(),
  morning_reminder_time: ClockTimeSchema.nullable().optional(),
  evening_reminder_time: ClockTimeSchema.nullable().optional(),
  due_alerts_enabled: z.boolean().optional(),
  onboarding_complete: z.boolean().optional(),
  ai_provider: AiProviderSchema.optional(),
  ai_configs_update: z
    .object({
      provider: AiProviderSchema,
      key: z.string().max(500).nullable().optional(),
      model: z.string().max(100).nullable().optional(),
      baseUrl: z.union([z.string().url().max(500), z.literal(""), z.null()]).optional(),
    })
    .optional(),
});

// ── Wire response ─────────────────────────────────────────────────────────────

/**
 * One provider's stored configuration as the client is allowed to see it.
 * `hasKey` replaces the key itself — see the security note at the top of file.
 */
export const AiProviderConfigWireSchema = z.object({
  hasKey: z.boolean(),
  model: z.string(),
  baseUrl: z.string(),
});

export const SettingsWireSchema = z.object({
  locale: z.string(),
  accent: z.string(),
  density: z.string(),
  reduced_motion: z.boolean(),
  ai_enabled: z.boolean(),
  pomodoro_duration: z.number(),
  short_break: z.number(),
  long_break: z.number(),
  long_break_interval: z.number(),
  auto_start_breaks: z.boolean(),
  notifications_enabled: z.boolean(),
  morning_reminder_time: z.string(),
  evening_reminder_time: z.string(),
  due_alerts_enabled: z.boolean(),
  onboarding_complete: z.boolean(),
  ai_provider: z.string(),
  /** Keyed by provider id — see {@link AiProviderSchema}. */
  ai_provider_configs: z.record(z.string(), AiProviderConfigWireSchema),
  /** Whether the deployment ships a shared cloud AI key (LUMO_AI_KEY). */
  ai_cloud_enabled: z.boolean(),
  /** Cloud AI calls used in the current calendar month. */
  ai_cloud_used: z.number(),
  /** Free-tier monthly ceiling for cloud AI calls. */
  ai_cloud_limit: z.number(),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type AiProvider = z.infer<typeof AiProviderSchema>;
export type SettingsPatchInput = z.input<typeof SettingsPatchBodySchema>;
export type AiProviderConfigWire = z.infer<typeof AiProviderConfigWireSchema>;
export type SettingsWire = z.infer<typeof SettingsWireSchema>;
