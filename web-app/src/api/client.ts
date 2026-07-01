/**
 * Real API client — talks to the local Hono/SQLite backend.
 *
 * Base URL is resolved once at startup:
 *  - Electron: port from Electron IPC (injected by main.cjs)
 *  - Dev/web:  VITE_API_BASE env var, or http://localhost:47291/v1
 *
 * JWT token is stored in localStorage and attached to every request.
 */

import type { AppSettings, BreakdownResponse, CompletedEntry, CountdownEvent, Habit, HabitLog, Person, PetChatMessage, Project, Task, TaskCreateInput, TaskUpdateInput, TaskCompleteResponse, TaskTemplate, ProjectTemplate, Template, TemplatePayload, ProjectTemplatePayload, User } from "@/types/task";
import type { SyncStatusResponse, SyncCycleResponse } from "@lumo/contracts";
import { ApiError } from "@/api/ApiError";

// ── Base URL ─────────────────────────────────────────────────────────────────

let resolvedBase: string | null = null;

async function getBase(): Promise<string> {
  if (resolvedBase) return resolvedBase;
  if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
    const port = await window.electronAPI.getApiPort();
    resolvedBase = `http://127.0.0.1:${port}/v1`;
  } else {
    resolvedBase = ((import.meta as any).env?.VITE_API_BASE as string | undefined) ?? "http://localhost:47291/v1";
  }
  return resolvedBase;
}

// ── Token ─────────────────────────────────────────────────────────────────────

const TOKEN_KEY = "lumo.token";
const REFRESH_KEY = "lumo.refresh_token";

// Prevents concurrent 401s from firing multiple lumo:session-expired events.
let sessionExpiredNotified = false;

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  sessionExpiredNotified = false;
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

function setRefreshToken(token: string) {
  localStorage.setItem(REFRESH_KEY, token);
}

function clearRefreshToken() {
  localStorage.removeItem(REFRESH_KEY);
}

// A single in-flight refresh shared by all concurrent 401s. Refresh tokens are
// single-use with server-side reuse detection, so two parallel refreshes with
// the same token would trip the theft guard and revoke the whole family. This
// guard ensures exactly one rotation happens; everyone else awaits its result.
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const rt = getRefreshToken();
  if (!rt) return false;
  refreshPromise = (async (): Promise<boolean> => {
    try {
      const base = await getBase();
      const res = await fetch(`${base}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        clearRefreshToken(); // unknown/expired/revoked → stop trying
        return false;
      }
      const data = await res.json().catch(() => null);
      if (data?.token) setToken(data.token);
      if (data?.refreshToken) setRefreshToken(data.refreshToken);
      return Boolean(data?.token);
    } catch {
      return false; // network blip — keep the refresh token, try again later
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// ── Resilience config ───────────────────────────────────────────────────────
//
// Slow or flaky networks must never leave the UI stuck on an infinite spinner,
// and a transient blip on a read should self-heal without bothering the user.
//
//  • Timeout — every attempt is abort()ed after REQUEST_TIMEOUT_MS so a request
//    that never responds rejects with a clear "请求超时" error.
//  • Retry — only *idempotent* reads (GET) are retried, on network failures,
//    timeouts, and transient (gateway/overload) statuses. Writes are NEVER
//    retried, so a slow POST can't silently duplicate a row.
//  • 500 is deliberately NOT retryable: it's usually a deterministic app error,
//    not a blip, so retrying just delays the inevitable failure.

const REQUEST_TIMEOUT_MS = 15_000; // per-attempt cap
const MAX_RETRIES = 2; // total attempts = 1 + MAX_RETRIES
const RETRY_BASE_DELAY_MS = 300; // exponential backoff base (300ms, 600ms)
const RETRYABLE_STATUS = new Set([408, 429, 502, 503, 504]);

function isIdempotent(method: string): boolean {
  return method === "GET";
}

function backoff(attempt: number): Promise<void> {
  // attempt is 1-based for the first retry.
  return new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: { idempotencyKey?: string }
): Promise<T> {
  const base = await getBase();
  let token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts?.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const retryable = isIdempotent(method);
  const isAuthPath = path.startsWith("/auth/");
  // One transparent access-token refresh per call: a 401 is rejected at the auth
  // middleware before the handler runs, so retrying once after a refresh is safe
  // even for writes (the original never executed → no duplicate).
  let refreshAttempted = false;

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (networkErr) {
      clearTimeout(timer);
      const isTimeout = networkErr instanceof Error && networkErr.name === "AbortError";
      // Idempotent reads retry on network errors / timeouts; writes never do.
      if (retryable && attempt < MAX_RETRIES) {
        await backoff(attempt + 1);
        continue;
      }
      if (isTimeout) {
        throw new Error(`请求超时 (${base}${path})`);
      }
      const detail = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw new Error(`无法连接到服务器 (${base})：${detail}`);
    }
    clearTimeout(timer);

    if (!res.ok) {
      // Retry transient (gateway/overload) statuses for idempotent reads before
      // consuming the body or surfacing the error.
      if (retryable && RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
        await backoff(attempt + 1);
        continue;
      }
      // 401 with a token present (not during login/register) means session expired.
      // Guard token && to avoid mis-firing on wrong-password 401s at the login page.
      // Deduplicate concurrent 401s so only one event + one toast reaches the user.
      // EXEMPT /sync/*: those 401s are about the CLOUD account (e.g. a wrong cloud
      // password on /sync/enable), NOT the local session — they must not log the
      // user out of the local app.
      const isSyncAuth = path.startsWith("/sync/");
      if (res.status === 401 && token && !isAuthPath && !isSyncAuth) {
        // Access token likely expired — try a one-time transparent refresh and
        // replay the request before declaring the session dead.
        if (!refreshAttempted) {
          refreshAttempted = true;
          const refreshed = await tryRefresh();
          if (refreshed) {
            token = getToken();
            if (token) headers["Authorization"] = `Bearer ${token}`;
            continue; // replay the original request with the fresh access token
          }
        }
        // Refresh unavailable or failed → the session is truly over.
        if (!sessionExpiredNotified) {
          sessionExpiredNotified = true;
          clearToken();
          clearRefreshToken();
          window.dispatchEvent(new Event("lumo:session-expired"));
        }
      }
      const err = await res.json().catch(() => ({ error: res.statusText }));
      const errBody = (err as any).error;
      const errMsg =
        typeof errBody === "string"
          ? errBody
          : errBody?.message ?? `HTTP ${res.status} ${res.statusText}`;
      // Surface the backend's canonical envelope (code + full message + status +
      // optional per-field detail) on a typed ApiError so callers can map
      // specific failures (e.g. CLOUD_AUTH_FAILED) and render inline field
      // messages, instead of substring-matching a localized string.
      const code =
        errBody && typeof errBody === "object" && typeof errBody.code === "string"
          ? (errBody.code as string)
          : undefined;
      const fields =
        errBody && typeof errBody === "object" && Array.isArray(errBody.fields)
          ? (errBody.fields as ApiError["fields"])
          : undefined;
      throw new ApiError(errMsg, { code, status: res.status, fields });
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }
}

// ── Type adapters (backend snake_case → frontend camelCase where needed) ──────

/** The PATCH /tasks/:id wire body — shared by online update and offline replay. */
export function buildTaskUpdateBody(patch: TaskUpdateInput) {
  return {
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.desc !== undefined && { desc: patch.desc }),
    ...(patch.quadrant !== undefined && { quadrant: patch.quadrant }),
    ...(patch.today !== undefined && { today: patch.today }),
    ...(patch.week_focus !== undefined && { week_focus: patch.week_focus }),
    ...(patch.due !== undefined && { due: patch.due }),
    ...(patch.duration !== undefined && { duration: patch.duration }),
    ...(patch.pomos_total !== undefined && { pomos_total: patch.pomos_total }),
    ...(patch.assignee_ids !== undefined && { assignee_ids: patch.assignee_ids }),
    ...(patch.conviction !== undefined && { conviction: patch.conviction }),
    ...(patch.next_step !== undefined && { next_step: patch.next_step }),
    ...(patch.reason !== undefined && { reason: patch.reason }),
    ...(patch.ai_suggest !== undefined && { ai_suggest: patch.ai_suggest }),
    ...(patch.not_now !== undefined && { not_now: patch.not_now }),
    ...(patch.recurrence !== undefined && { recurrence: patch.recurrence }),
    ...(patch.subtasks !== undefined && { subtasks: patch.subtasks }),
    ...(patch.tags !== undefined && { tags: patch.tags }),
    ...(patch.project_id !== undefined && { project_id: patch.project_id }),
    ...(patch.scheduled_start !== undefined && { scheduled_start: patch.scheduled_start }),
    ...(patch.remind_at !== undefined && { remind_at: patch.remind_at }),
  };
}

/** PATCH /habits/:id wire body — curates undefined→null so an offline replay
 *  clears a field the same way the online call does. Shared by both paths. */
export function buildHabitUpdateBody(patch: Partial<Omit<Habit, "id" | "createdAt">>) {
  return {
    ...(patch.title !== undefined && { title: patch.title }),
    ...("emoji" in patch && { emoji: patch.emoji ?? null }),
    ...(patch.color !== undefined && { color: patch.color }),
    ...(patch.frequency !== undefined && { frequency: patch.frequency }),
    ...("frequencyDays" in patch && { frequencyDays: patch.frequencyDays ?? null }),
    ...("frequencyTimes" in patch && { frequencyTimes: patch.frequencyTimes ?? null }),
    ...("frequencyInterval" in patch && { frequencyInterval: patch.frequencyInterval ?? null }),
    ...("note" in patch && { note: patch.note ?? null }),
  };
}

/** PATCH /countdowns/:id wire body — shared by online update and offline replay. */
export function buildCountdownUpdateBody(patch: Partial<Omit<CountdownEvent, "id" | "createdAt">>) {
  return {
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.date !== undefined && { date: patch.date }),
    ...("emoji" in patch && { emoji: patch.emoji ?? null }),
    ...(patch.color !== undefined && { color: patch.color }),
    ...(patch.repeat !== undefined && { repeat: patch.repeat }),
    ...("note" in patch && { note: patch.note ?? null }),
    ...(patch.calendar !== undefined && { calendar: patch.calendar }),
  };
}

/** The POST /tasks wire body — shared by online create and offline-queue replay. */
export function buildTaskCreateBody(input: TaskCreateInput, id?: string) {
  return {
    ...(id ? { id } : {}),
    title: input.title,
    desc: input.desc ?? null,
    quadrant: input.quadrant,
    today: input.today,
    due: input.due ?? null,
    duration: input.duration,
    pomos_total: input.pomos_total,
    assignee_ids: input.assignee_ids ?? [],
    conviction: input.conviction ?? null,
    next_step: input.next_step ?? null,
    reason: input.reason ?? null,
    ai_suggest: input.ai_suggest ?? null,
    not_now: input.not_now ?? [],
    recurrence: input.recurrence ?? "none",
    subtasks: input.subtasks ?? [],
    tags: input.tags ?? [],
    ...(input.project_id !== undefined && { project_id: input.project_id }),
    scheduled_start: input.scheduled_start ?? null,
    remind_at: input.remind_at ?? null,
  };
}

function adaptTask(raw: any): Task {
  return {
    id: raw.id,
    assignee_ids: raw.assignee_ids ?? [],
    title: raw.title,
    desc: raw.desc ?? undefined,
    quadrant: raw.quadrant,
    today: raw.today,
    week_focus: raw.week_focus ?? false,
    due: raw.due ?? null,
    duration: raw.duration,
    pomos_done: raw.pomos_done,
    pomos_total: raw.pomos_total,
    conviction: raw.conviction ?? undefined,
    next_step: raw.next_step ?? undefined,
    reason: raw.reason ?? undefined,
    ai_suggest: raw.ai_suggest ?? undefined,
    completed: raw.completed,
    not_now: raw.not_now ?? [],
    recurrence: raw.recurrence ?? "none",
    subtasks: raw.subtasks ?? [],
    tags: raw.tags ?? [],
    project_id: raw.project_id ?? null,
    scheduled_start: raw.scheduled_start ?? null,
    remind_at: raw.remind_at ?? null,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
  };
}

function adaptEntry(raw: any): CompletedEntry {
  return {
    id: raw.id,
    taskId: raw.task_id ?? undefined,
    title: raw.title,
    duration: raw.duration,
    quadrant: raw.quadrant ?? undefined,
    startedAt: raw.startedAt ?? undefined,
    completedAt: raw.completedAt ?? undefined,
    projectId: raw.project_id ?? null,
  };
}

function adaptPerson(raw: any): Person {
  return {
    id: raw.id,
    name: raw.name,
    initials: raw.initials,
    color: raw.color,
    email: raw.email ?? undefined,
  };
}

// ── Local stand-in user (no-auth fallback) ────────────────────────────────────

const LOCAL_USER: User = {
  id: "local",
  name: "You",
  email: "",
  initials: "YO",
  local: true,
  plan: "free",
  stats: { tasks: 0, pomodoros: 0, syncOK: false },
};

// ── Public API ────────────────────────────────────────────────────────────────

export const api = {
  async getUser(): Promise<User> {
    return req<User>("GET", "/user");
  },

  async signIn(input: { email: string; password: string }): Promise<User> {
    const res = await req<{ token: string; refreshToken?: string; user: User }>("POST", "/auth/signin", input);
    setToken(res.token);
    if (res.refreshToken) setRefreshToken(res.refreshToken);
    return res.user;
  },

  async signInWithProvider(_provider: "google" | "apple" | "github"): Promise<User> {
    throw new Error("OAuth providers are not yet supported in local mode.");
  },

  async register(input: {
    email: string;
    password: string;
    confirm: string;
    nickname?: string;
  }): Promise<User> {
    if (input.password !== input.confirm) throw new Error("Passwords don't match.");
    const res = await req<{ token: string; refreshToken?: string; user: User }>("POST", "/auth/register", {
      email: input.email,
      password: input.password,
      name: input.nickname?.trim() || input.email.split("@")[0],
    });
    setToken(res.token);
    if (res.refreshToken) setRefreshToken(res.refreshToken);
    return res.user;
  },

  // Change the signed-in user's password. The server verifies `current_password`
  // (400 WRONG_PASSWORD on mismatch) and, on success, bumps the account's
  // session_version — which invalidates THIS session's access + refresh tokens.
  // Callers must re-authenticate afterwards to mint fresh tokens (see the auth
  // store action), otherwise the next request will 401 the user out.
  async changePassword(input: { current_password: string; new_password: string }): Promise<void> {
    await req<{ ok: true }>("POST", "/auth/change-password", input);
  },

  async signOut(): Promise<User> {
    // Send the refresh token so the server can revoke it (best-effort).
    const refreshToken = getRefreshToken() ?? undefined;
    await req("POST", "/auth/signout", refreshToken ? { refreshToken } : undefined).catch(() => {});
    clearToken();
    clearRefreshToken();
    return LOCAL_USER;
  },

  // `q` performs a server-side keyword search over task title/description.
  // Omitted (default) → returns the full incomplete-task list.
  //
  // The API is keyset-paginated ({ items, nextCursor }); we transparently page
  // through to assemble the full list so callers (matrix/today/week views) keep
  // their full-set semantics. Each HTTP request stays bounded (server-side P1
  // win); a hard page cap guards against a pathological loop. Server-driven
  // infinite scroll is a future increment (ADR-0001).
  async listTasks(q?: string): Promise<Task[]> {
    const base = q ? `/tasks?q=${encodeURIComponent(q)}&limit=200` : "/tasks?limit=200";
    const out: Task[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 1000; page++) {
      const path: string = cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base;
      const res: { items: any[]; nextCursor: string | null } = await req("GET", path);
      out.push(...res.items.map(adaptTask));
      if (res.nextCursor == null) return out;
      cursor = res.nextCursor;
    }
    return out;
  },

  async listToday(): Promise<Task[]> {
    const all = await this.listTasks();
    return all.filter((t) => t.today && !t.completed);
  },

  async listCompletedToday(): Promise<CompletedEntry[]> {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const rows = await req<any[]>("GET", `/completed?date=${date}`);
    return rows.map(adaptEntry);
  },

  async listAllCompleted(): Promise<CompletedEntry[]> {
    // The no-date /completed is keyset-paginated; page through the whole history
    // so all-time stats (streaks/totals/wrapped) are computed over everything,
    // not just the first page. Bounded by a sane page cap to avoid a runaway loop.
    const all: CompletedEntry[] = [];
    let cursor: string | null = null;
    for (let pages = 0; pages < 200; pages++) {
      const path: string = cursor
        ? `/completed?limit=200&cursor=${encodeURIComponent(cursor)}`
        : "/completed?limit=200";
      const res: { items: any[]; nextCursor: string | null } =
        await req("GET", path);
      all.push(...res.items.map(adaptEntry));
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    return all;
  },

  async classifyTasks(): Promise<Array<{
    task_id: string;
    quadrant: string;
    confidence: number;
    reason?: string;
  }>> {
    const data = await req<{ suggestions: Array<{ task_id: string; quadrant: string; confidence: number; reason?: string }> }>(
      "POST", "/ai/classify"
    );
    return data.suggestions ?? [];
  },

  async parseTask(text: string, locale?: string): Promise<{
    title: string;
    quadrant: string;
    due: string | null;
    duration: number | null;
    confidence: number;
  }> {
    return req("POST", "/ai/parse", { text, locale });
  },

  async breakdownSubtasks(taskId: string, locale?: string): Promise<BreakdownResponse> {
    return req("POST", "/ai/breakdown", { taskId, locale });
  },

  async createTask(input: TaskCreateInput, id?: string): Promise<Task> {
    const raw = await req<any>("POST", "/tasks", buildTaskCreateBody(input, id));
    return adaptTask(raw);
  },

  async updateTask(id: string, patch: TaskUpdateInput): Promise<Task> {
    const raw = await req<any>("PATCH", `/tasks/${id}`, buildTaskUpdateBody(patch));
    return adaptTask(raw);
  },

  async completeTask(id: string): Promise<TaskCompleteResponse> {
    return req<TaskCompleteResponse>("POST", `/tasks/${id}/complete`);
  },

  async uncompleteTask(logId: string): Promise<void> {
    await req("POST", `/completed/${logId}/reopen`);
  },

  async deleteTask(id: string): Promise<void> {
    await req("DELETE", `/tasks/${id}`);
  },

  async listPeople(): Promise<Person[]> {
    const rows = await req<any[]>("GET", "/people");
    return rows.map(adaptPerson);
  },

  async createPerson(input: Omit<Person, "id">, id?: string): Promise<Person> {
    const raw = await req<any>("POST", "/people", { ...input, ...(id ? { id } : {}) });
    return adaptPerson(raw);
  },

  async updatePerson(id: string, patch: Partial<Omit<Person, "id">>): Promise<Person> {
    const raw = await req<any>("PATCH", `/people/${id}`, patch);
    return adaptPerson(raw);
  },

  async deletePerson(id: string): Promise<void> {
    await req("DELETE", `/people/${id}`);
  },

  async getSettings(): Promise<AppSettings> {
    return req<AppSettings>("GET", "/settings");
  },

  async patchSettings(patch: {
    locale?: string;
    accent?: string;
    density?: string;
    reduced_motion?: boolean;
    ai_enabled?: boolean;
    notifications_enabled?: boolean;
    morning_reminder_time?: string | null;
    evening_reminder_time?: string | null;
    due_alerts_enabled?: boolean;
    onboarding_complete?: boolean;
    ai_provider?: "openai" | "deepseek" | "claude" | "custom";
    ai_configs_update?: {
      provider: "openai" | "deepseek" | "claude" | "custom";
      key?: string | null;
      model?: string | null;
      baseUrl?: string | null;
    };
  }): Promise<AppSettings> {
    return req<AppSettings>("PATCH", "/settings", patch);
  },

  async petChat(body: {
    messages: Pick<PetChatMessage, "role" | "content">[];
    context: {
      page?: string;
      todayTasks?: { id: string; title: string; quadrant: string }[];
      q1Count?: number;
      recentCompleted?: { title: string; completedAt: string }[];
      locale?: string;
      userName?: string;
    };
  }): Promise<{ reply: string; mood: "idle" | "happy" | "excited"; fallback: boolean; toolsUsed?: string[] }> {
    return req("POST", "/ai/chat", body);
  },

  async storageInfo(): Promise<{ dbPath: string; dbDir: string; dbSize: number; dbName: string }> {
    return req("GET", "/storage/info");
  },

  async outlookStatus(): Promise<{ configured: boolean; userEmail: string | null }> {
    return req("GET", "/outlook/status");
  },

  async outlookCalendar(start: string, end: string): Promise<{ events: unknown[] }> {
    return req("GET", `/outlook/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  },

  // ── Cloud sync (in-backend sync client; talks to the LOCAL backend) ─────────
  // All four require the local JWT (user already signed into the local backend).
  // The token is never returned by the backend in the status shape.

  /** GET /sync/status → current binding status (never the cloud token). */
  async syncStatus(): Promise<SyncStatusResponse> {
    return req<SyncStatusResponse>("GET", "/sync/status");
  },

  /** POST /sync/enable → signs into the cloud account + first reconcile. */
  async syncEnable(email: string, password: string): Promise<SyncStatusResponse> {
    return req<SyncStatusResponse>("POST", "/sync/enable", { email, password });
  },

  /** POST /sync/disable → clears cloud creds; local data stays. */
  async syncDisable(): Promise<SyncStatusResponse> {
    return req<SyncStatusResponse>("POST", "/sync/disable");
  },

  /** POST /sync/now → runs one push-then-pull cycle on demand. */
  async syncNow(): Promise<SyncCycleResponse> {
    return req<SyncCycleResponse>("POST", "/sync/now");
  },
};

export type ApiClient = typeof api;

// ── Adapter helpers ───────────────────────────────────────────────────────────

function adaptHabit(raw: any): Habit {
  return {
    id: raw.id,
    title: raw.title,
    emoji: raw.emoji ?? undefined,
    color: raw.color,
    frequency: raw.frequency,
    frequencyDays: raw.frequencyDays ?? undefined,
    frequencyTimes: raw.frequencyTimes ?? undefined,
    frequencyInterval: raw.frequencyInterval ?? undefined,
    note: raw.note ?? undefined,
    createdAt: raw.createdAt,
  };
}

function adaptHabitLog(raw: any): HabitLog {
  return {
    habitId: raw.habitId,
    date: raw.date,
    completedAt: raw.completedAt,
  };
}

function adaptTemplate(raw: any): Template {
  const createdAt = raw.created_at ?? raw.createdAt;
  if (raw.kind === "project") {
    return {
      id: raw.id,
      name: raw.name,
      kind: "project",
      payload: raw.payload as ProjectTemplatePayload,
      createdAt,
    };
  }
  return {
    id: raw.id,
    name: raw.name,
    kind: "task",
    payload: raw.payload as TemplatePayload,
    createdAt,
  };
}

function adaptCountdownEvent(raw: any): CountdownEvent {
  return {
    id: raw.id,
    title: raw.title,
    date: raw.date,
    emoji: raw.emoji ?? undefined,
    color: raw.color,
    repeat: raw.repeat,
    note: raw.note ?? undefined,
    calendar: raw.calendar ?? "solar",
    createdAt: raw.createdAt,
  };
}

// ── Habits REST API ───────────────────────────────────────────────────────────

export const habitApi = {
  async listHabits(_userId: string): Promise<Habit[]> {
    const rows = await req<any[]>("GET", "/habits");
    return rows.map(adaptHabit);
  },

  async listLogs(_userId: string): Promise<HabitLog[]> {
    const rows = await req<any[]>("GET", "/habits/logs");
    return rows.map(adaptHabitLog);
  },

  async createHabit(_userId: string, input: Omit<Habit, "id" | "createdAt">, id?: string): Promise<Habit> {
    const raw = await req<any>("POST", "/habits", {
      ...(id ? { id } : {}),
      title: input.title,
      emoji: input.emoji ?? null,
      color: input.color,
      frequency: input.frequency,
      frequencyDays: input.frequencyDays ?? null,
      frequencyTimes: input.frequencyTimes ?? null,
      frequencyInterval: input.frequencyInterval ?? null,
      note: input.note ?? null,
    });
    return adaptHabit(raw);
  },

  async updateHabit(_userId: string, id: string, patch: Partial<Omit<Habit, "id" | "createdAt">>): Promise<Habit> {
    const raw = await req<any>("PATCH", `/habits/${id}`, buildHabitUpdateBody(patch));
    return adaptHabit(raw);
  },

  async deleteHabit(_userId: string, id: string): Promise<void> {
    await req<void>("DELETE", `/habits/${id}`);
  },

  async logHabit(_userId: string, habitId: string, date: string): Promise<HabitLog> {
    const raw = await req<any>("POST", `/habits/${habitId}/log`, { date });
    return adaptHabitLog(raw);
  },

  async unlogHabit(_userId: string, habitId: string, date: string): Promise<void> {
    await req<void>("DELETE", `/habits/${habitId}/log/${date}`);
  },

  async migrate(_userId: string, habits: Habit[], logs: HabitLog[]): Promise<void> {
    await req<void>("POST", "/habits/migrate", {
      habits: habits.map((h) => ({
        id: h.id,
        title: h.title,
        emoji: h.emoji ?? null,
        color: h.color,
        frequency: h.frequency,
        frequencyDays: h.frequencyDays ?? null,
        frequencyTimes: h.frequencyTimes ?? null,
        frequencyInterval: h.frequencyInterval ?? null,
        note: h.note ?? null,
        createdAt: h.createdAt,
      })),
      logs: logs.map((l) => ({
        habitId: l.habitId,
        date: l.date,
        completedAt: l.completedAt,
      })),
    });
  },
};

// ── Countdown REST API ────────────────────────────────────────────────────────

export const countdownApi = {
  async list(_userId: string): Promise<CountdownEvent[]> {
    const rows = await req<any[]>("GET", "/countdowns");
    return rows.map(adaptCountdownEvent);
  },

  async create(_userId: string, input: Omit<CountdownEvent, "id" | "createdAt">, id?: string): Promise<CountdownEvent> {
    const raw = await req<any>("POST", "/countdowns", {
      ...(id ? { id } : {}),
      title: input.title,
      date: input.date,
      emoji: input.emoji ?? null,
      color: input.color,
      repeat: input.repeat,
      note: input.note ?? null,
      calendar: input.calendar,
    });
    return adaptCountdownEvent(raw);
  },

  async update(_userId: string, id: string, patch: Partial<Omit<CountdownEvent, "id" | "createdAt">>): Promise<CountdownEvent> {
    const raw = await req<any>("PATCH", `/countdowns/${id}`, buildCountdownUpdateBody(patch));
    return adaptCountdownEvent(raw);
  },

  async delete(_userId: string, id: string): Promise<void> {
    await req<void>("DELETE", `/countdowns/${id}`);
  },

  async migrate(_userId: string, events: CountdownEvent[]): Promise<void> {
    await req<void>("POST", "/countdowns/migrate", {
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        date: e.date,
        emoji: e.emoji ?? null,
        color: e.color,
        repeat: e.repeat,
        note: e.note ?? null,
        calendar: e.calendar ?? "solar",
        createdAt: e.createdAt,
      })),
    });
  },
};

// ── Template REST API (#173) ──────────────────────────────────────────────────

export const templateApi = {
  async list(): Promise<Template[]> {
    const rows = await req<any[]>("GET", "/templates");
    // Defensive: tolerate a non-array body (e.g. a stubbed endpoint) instead of
    // throwing a raw TypeError from .map.
    return Array.isArray(rows) ? rows.map(adaptTemplate) : [];
  },

  async create(name: string, payload: TemplatePayload, id?: string): Promise<TaskTemplate> {
    const raw = await req<any>("POST", "/templates", {
      ...(id ? { id } : {}),
      name,
      payload,
    });
    return adaptTemplate(raw) as TaskTemplate;
  },

  // Project templates (#211 V2 ⭐3): stored on the same entity with kind="project".
  async createProject(name: string, payload: ProjectTemplatePayload, id?: string): Promise<ProjectTemplate> {
    const raw = await req<any>("POST", "/templates", {
      ...(id ? { id } : {}),
      name,
      kind: "project",
      payload,
    });
    return adaptTemplate(raw) as ProjectTemplate;
  },

  async rename(id: string, name: string): Promise<Template> {
    const raw = await req<any>("PATCH", `/templates/${id}`, { name });
    return adaptTemplate(raw);
  },

  async delete(id: string): Promise<void> {
    await req<void>("DELETE", `/templates/${id}`);
  },
};

// ── Project REST API (#211) ───────────────────────────────────────────────────

function adaptProject(raw: any): Project {
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category ?? undefined,
    color: raw.color,
    emoji: raw.emoji ?? undefined,
    goals: Array.isArray(raw.goals) ? raw.goals : [],
    content: raw.content ?? undefined,
    status: raw.status ?? "active",
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export type ProjectCreateInput = Omit<Project, "id" | "createdAt" | "updatedAt">;
export type ProjectUpdateInput = Partial<Omit<Project, "id" | "createdAt" | "updatedAt">>;

export const projectApi = {
  async list(): Promise<Project[]> {
    const rows = await req<any[]>("GET", "/projects");
    return Array.isArray(rows) ? rows.map(adaptProject) : [];
  },

  async create(input: ProjectCreateInput, id?: string): Promise<Project> {
    const raw = await req<any>("POST", "/projects", {
      ...(id ? { id } : {}),
      name: input.name,
      category: input.category ?? null,
      color: input.color,
      emoji: input.emoji ?? null,
      goals: input.goals ?? [],
      content: input.content ?? null,
      status: input.status ?? "active",
    });
    return adaptProject(raw);
  },

  async update(id: string, patch: ProjectUpdateInput): Promise<Project> {
    const raw = await req<any>("PATCH", `/projects/${id}`, {
      ...(patch.name !== undefined && { name: patch.name }),
      ...("category" in patch && { category: patch.category ?? null }),
      ...(patch.color !== undefined && { color: patch.color }),
      ...("emoji" in patch && { emoji: patch.emoji ?? null }),
      ...(patch.goals !== undefined && { goals: patch.goals }),
      ...("content" in patch && { content: patch.content ?? null }),
      ...(patch.status !== undefined && { status: patch.status }),
    });
    return adaptProject(raw);
  },

  async delete(id: string): Promise<void> {
    await req<void>("DELETE", `/projects/${id}`);
  },
};
