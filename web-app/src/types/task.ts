/**
 * Core domain types.
 *
 * `Task`, `Quadrant`, `LocalizedString`, `TaskRecurrence` and `Subtask` are the
 * single source of truth from `@lumo/contracts` (the shared API contract) and
 * are re-exported here so existing imports (`@/types/task`) keep working.
 *
 * Contract-First: to change a task field, edit the Zod schema in
 * `@lumo/contracts` first — do not redefine these shapes here.
 *
 * The remaining types below (User, CompletedEntry, AppSettings, Habit, …) are
 * not yet migrated to the contract package and are still defined locally.
 */

import type {
  Task,
  Quadrant,
  LocalizedString,
  TaskRecurrence,
  Subtask,
  TaskCreateInput,
  TaskUpdateInput,
  TaskCompleteResponse,
  BreakdownResponse,
  Person,
  PersonCreateInput,
  PersonUpdateInput,
  TaskTemplate,
  TemplatePayload,
  TemplateCreateInput,
} from "@lumo/contracts";

export type {
  Task,
  Quadrant,
  LocalizedString,
  TaskRecurrence,
  Subtask,
  TaskCreateInput,
  TaskUpdateInput,
  TaskCompleteResponse,
  BreakdownResponse,
  Person,
  PersonCreateInput,
  PersonUpdateInput,
  TaskTemplate,
  TemplatePayload,
  TemplateCreateInput,
};

export type Locale = "en" | "zh";

export interface CompletedEntry {
  id: string;
  title: LocalizedString;
  /** Actual minutes spent (may differ from estimate). */
  duration: number;
  /** ISO timestamp when the focus session started. */
  startedAt?: string;
  /** ISO timestamp when the task was marked complete. */
  completedAt?: string;
  /** Quadrant of the source task, for the timeline chip. */
  quadrant?: Quadrant;
  /** Original task ID — used to restore the task when reopening. */
  taskId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  /** Initials for avatar. */
  initials: string;
  /** Whether the account is local-only (no cloud sync). */
  local: boolean;
  /** Subscription tier. */
  plan?: "free" | "pro";
  /** Renewal date for paid plans. */
  renewsAt?: string;
  /** Aggregate counters surfaced on the account page. */
  stats?: {
    tasks: number;
    pomodoros: number;
    syncOK: boolean;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

export interface ProviderConfig {
  hasKey: boolean;
  model: string;
  baseUrl: string;
}

export interface AppSettings {
  locale: "en" | "zh";
  accent: "green" | "cyan" | "amber" | "graphite";
  density: "comfortable" | "compact";
  reduced_motion: boolean;
  ai_enabled: boolean;
  pomodoro_duration: number;
  short_break: number;
  long_break: number;
  long_break_interval: number;
  auto_start_breaks: boolean;
  notifications_enabled: boolean;
  morning_reminder_time: string | null;
  evening_reminder_time: string | null;
  due_alerts_enabled: boolean;
  onboarding_complete: boolean;
  ai_provider: "openai" | "deepseek" | "claude" | "custom";
  ai_provider_configs: Record<string, ProviderConfig>;
  /** Whether the server has a built-in Lumo Cloud AI key configured. */
  ai_cloud_enabled: boolean;
  /** How many Lumo Cloud AI calls the user has used this month. */
  ai_cloud_used: number;
  /** Monthly quota for free users (100). */
  ai_cloud_limit: number;
}

export interface PetChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
  toolsUsed?: string[];
}

export type CountdownColor = "green" | "cyan" | "amber" | "red";
export type CountdownRepeat = "none" | "yearly";
/** Which calendar the user authored the event in. `date` is ALWAYS a solar
 * (Gregorian) ISO anchor; 'lunar' only changes display + yearly-recurrence math. */
export type CountdownCalendar = "solar" | "lunar";

export interface CountdownEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD — always the solar (Gregorian) anchor date
  emoji?: string;
  color: CountdownColor;
  repeat: CountdownRepeat;
  note?: string;
  calendar: CountdownCalendar;
  createdAt: string;
}

export type HabitFrequency =
  | "daily"          // every day
  | "weekdays"       // Mon–Fri
  | "weekend"        // Sat–Sun
  | "days_of_week"   // specific weekdays chosen by user
  | "times_per_week" // N completions per calendar week, any day
  | "interval";      // every N days

export type HabitColor = "green" | "cyan" | "amber" | "red" | "purple";

export interface Habit {
  id: string;
  title: string;
  emoji?: string;
  color: HabitColor;
  frequency: HabitFrequency;
  /** [0-6] Sun=0 … Sat=6, used when frequency === "days_of_week" */
  frequencyDays?: number[];
  /** 1–7, used when frequency === "times_per_week" (default 3) */
  frequencyTimes?: number;
  /** 2–30, used when frequency === "interval" (default 2) */
  frequencyInterval?: number;
  note?: string;
  createdAt: string;
}

export interface HabitLog {
  habitId: string;
  date: string; // YYYY-MM-DD
  completedAt: string;
}
