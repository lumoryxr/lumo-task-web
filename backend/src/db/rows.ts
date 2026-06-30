/** Typed interfaces matching the SQLite column shapes for each table. */

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  initials: string;
  local: number;
  plan: string;
  renews_at: string | null;
  created_at: string;
  session_version: number;
}

export interface TaskRow {
  id: string;
  user_id: string;
  assignee_ids: string;
  title_en: string;
  title_zh: string | null;
  desc_en: string | null;
  desc_zh: string | null;
  quadrant: string;
  today: number;
  week_focus: number;
  due: string | null;
  duration: number;
  pomos_done: number;
  pomos_total: number;
  conviction: number | null;
  next_step_en: string | null;
  next_step_zh: string | null;
  reason_en: string | null;
  reason_zh: string | null;
  ai_suggest: string | null;
  completed: number;
  not_now_json: string;
  recurrence: string;
  subtasks_json: string | null;
  tags_json: string | null;
  project_id: string | null;
  scheduled_start: string | null;
  remind_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompletedEntryRow {
  id: string;
  user_id: string;
  task_id: string | null;
  title_en: string;
  title_zh: string | null;
  duration: number;
  quadrant: string | null;
  started_at: string | null;
  completed_at: string;
}

export interface PersonRow {
  id: string;
  user_id: string;
  name: string;
  initials: string;
  color: string;
  email: string | null;
  created_at: string;
}

export interface SettingsRow {
  user_id: string;
  locale: string;
  accent: string;
  density: string;
  reduced_motion: number;
  ai_enabled: number;
  pomodoro_duration: number;
  short_break: number;
  long_break: number;
  long_break_interval: number;
  auto_start_breaks: number;
  notifications_enabled: number;
  onboarding_complete: number;
  ai_provider: string | null;
  ai_api_key: string | null;
  ai_base_url: string | null;
  ai_model: string | null;
  ai_configs: string | null;
  ai_cloud_used: number;
  ai_cloud_month: string;
  morning_reminder_time: string;
  evening_reminder_time: string;
  due_alerts_enabled: number;
}

export interface FocusTaskRow {
  id: string;
  user_id: string;
  duration: number;
  pomos_done: number;
  pomos_total: number;
  title_en: string;
  title_zh: string | null;
  quadrant: string;
}

export interface HabitRow {
  id: string;
  user_id: string;
  title: string;
  emoji: string | null;
  color: string;
  frequency: string;
  frequency_days: string | null;
  frequency_times: number | null;
  frequency_interval: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface HabitLogRow {
  habit_id: string;
  user_id: string;
  date: string;
  completed_at: string;
}

export interface CountdownEventRow {
  id: string;
  user_id: string;
  title: string;
  date: string;
  emoji: string | null;
  color: string;
  repeat: string;
  note: string | null;
  calendar: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  category: string | null;
  color: string;
  emoji: string | null;
  goals_json: string;
  content: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  // deleted_at added via the shared soft-delete ALTER loop in migrate.ts
}

export interface TemplateRow {
  id: string;
  user_id: string;
  name: string;
  kind: string;
  /** JSON-encoded TemplatePayload (opaque at the DB layer). */
  payload: string;
  created_at: string;
  updated_at: string;
}
