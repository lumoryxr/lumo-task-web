import type { ToolDefinition, ToolCall } from "./ai-client.js";
import { selectTodayPlan, planTaskMinutes } from "./planner.js";

// ── Tool definitions ──────────────────────────────────────────────────────────
//
// RULE: never expose auth, delete-account, or change-password operations.
// All other app APIs are fair game so the pet can fully control the app.

export const TASK_TOOLS: ToolDefinition[] = [
  // ── Tasks ────────────────────────────────────────────────────────────────

  {
    name: "list_tasks",
    description: "List the user's active (incomplete) tasks. ALWAYS call this before update/complete/delete to get the correct task ID. Never guess an ID.",
    parameters: {
      type: "object",
      properties: {
        quadrant: {
          type: "string",
          description: "Filter by Eisenhower quadrant",
          enum: ["Q1", "Q2", "Q3", "Q4", "unclassified"],
        },
        today_only: {
          type: "string",
          description: "'true' to return only tasks in today's plan",
          enum: ["true", "false"],
        },
      },
    },
  },

  {
    name: "create_task",
    description: "Create a new task. When the user asks to add/create/记录 a task, call this immediately. Infer quadrant: Q1=urgent+important, Q2=important not urgent, Q3=urgent not important, Q4=neither. Default to Q2 if unclear.",
    parameters: {
      type: "object",
      properties: {
        title:    { type: "string", description: "Task title in the user's language" },
        quadrant: { type: "string", description: "Eisenhower quadrant", enum: ["Q1", "Q2", "Q3", "Q4", "unclassified"] },
        today:    { type: "string", description: "'true' to add to today's focus plan", enum: ["true", "false"] },
        due:      { type: "string", description: "Due date YYYY-MM-DD (optional)" },
        duration: { type: "string", description: "Estimated minutes as a number string (optional)" },
        recurrence: {
          type: "string",
          description: "Repeat schedule (optional)",
          enum: ["none", "daily", "weekdays", "weekly", "monthly"],
        },
      },
      required: ["title"],
    },
  },

  {
    name: "update_task",
    description: "Update one or more fields of an existing task. Use list_tasks first to find the ID. Can change title, quadrant, today flag, due date, duration, or recurrence.",
    parameters: {
      type: "object",
      properties: {
        id:         { type: "string", description: "Task ID from list_tasks" },
        title:      { type: "string", description: "New title" },
        quadrant:   { type: "string", description: "New Eisenhower quadrant", enum: ["Q1", "Q2", "Q3", "Q4", "unclassified"] },
        today:      { type: "string", description: "'true' = add to today, 'false' = remove", enum: ["true", "false"] },
        due:        { type: "string", description: "New due date YYYY-MM-DD, or empty string to clear" },
        duration:   { type: "string", description: "New estimated minutes as a number string" },
        recurrence: { type: "string", description: "Repeat schedule", enum: ["none", "daily", "weekdays", "weekly", "monthly"] },
      },
      required: ["id"],
    },
  },

  {
    name: "complete_task",
    description: "Mark a task as done. Records it in the completion history and triggers recurrence spawn if set.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task ID from list_tasks" },
      },
      required: ["id"],
    },
  },

  {
    name: "delete_task",
    description: "Permanently delete a task. Only call this when the user explicitly says to delete/remove/删除 a task — not just complete it.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task ID from list_tasks" },
      },
      required: ["id"],
    },
  },

  {
    name: "list_completed",
    description: "List recently completed tasks with timestamps. Use to review what the user has accomplished.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "string", description: "Max number of entries to return (default 10, max 50)" },
      },
    },
  },

  {
    name: "uncomplete_task",
    description: "Reopen a recently completed task (undo completion). Use list_completed first to get the log ID.",
    parameters: {
      type: "object",
      properties: {
        log_id: { type: "string", description: "Completion log ID (from list_completed)" },
      },
      required: ["log_id"],
    },
  },

  // ── People / Team ─────────────────────────────────────────────────────────

  {
    name: "list_people",
    description: "List team members who can be assigned to tasks.",
    parameters: { type: "object", properties: {} },
  },

  {
    name: "create_person",
    description: "Add a new team member. Call when the user asks to add a colleague, teammate, or contact.",
    parameters: {
      type: "object",
      properties: {
        name:     { type: "string", description: "Full name" },
        initials: { type: "string", description: "2-3 character initials (e.g. 'JD')" },
        color:    { type: "string", description: "Hex color for avatar background (e.g. '#6366f1')" },
        email:    { type: "string", description: "Email address (optional)" },
      },
      required: ["name", "initials"],
    },
  },

  {
    name: "update_person",
    description: "Update a team member's details. Use list_people first to get the ID.",
    parameters: {
      type: "object",
      properties: {
        id:       { type: "string", description: "Person ID from list_people" },
        name:     { type: "string", description: "Full name" },
        initials: { type: "string", description: "2-3 character initials" },
        color:    { type: "string", description: "Hex color for avatar" },
        email:    { type: "string", description: "Email address" },
      },
      required: ["id"],
    },
  },

  {
    name: "delete_person",
    description: "Remove a team member. Only call when the user explicitly requests deletion.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Person ID from list_people" },
      },
      required: ["id"],
    },
  },

  // ── Stats / Productivity ──────────────────────────────────────────────────

  {
    name: "get_focus_stats",
    description: "Get the user's productivity statistics: tasks completed today, this week, focus minutes, and current streak.",
    parameters: { type: "object", properties: {} },
  },

  // ── AI helpers ────────────────────────────────────────────────────────────

  {
    name: "classify_tasks",
    description: "Auto-classify any unclassified tasks into Eisenhower quadrants using AI heuristics.",
    parameters: { type: "object", properties: {} },
  },

  {
    name: "get_recommended_task",
    description: "Get the AI-recommended highest-priority Q1 task to work on right now.",
    parameters: { type: "object", properties: {} },
  },

  // ── Batch / bulk operations ───────────────────────────────────────────────

  {
    name: "batch_create_tasks",
    description: "Create multiple tasks at once. Use when the user lists several tasks to add. Each item becomes its own task.",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          description: "Array of tasks to create",
          items: {
            type: "object",
            properties: {
              title:    { type: "string", description: "Task title" },
              quadrant: { type: "string", description: "Eisenhower quadrant", enum: ["Q1", "Q2", "Q3", "Q4", "unclassified"] },
              today:    { type: "string", description: "'true' to add to today's plan", enum: ["true", "false"] },
              due:      { type: "string", description: "Due date YYYY-MM-DD (optional)" },
            },
            required: ["title"],
          },
        },
      },
      required: ["tasks"],
    },
  },

  {
    name: "search_tasks",
    description: "Search tasks by keyword. Use when the user asks to find a specific task by name or content.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword" },
        include_completed: { type: "string", description: "'true' to include recently completed tasks", enum: ["true", "false"] },
      },
      required: ["query"],
    },
  },

  {
    name: "generate_today_plan",
    description: "Automatically select the most important tasks and add them to today's plan. Picks up to 5 high-priority tasks the user hasn't planned yet. If the user mentions how much time they have (e.g. 'I only have 2 hours'), pass available_hours so the plan's total estimated time stays within that budget.",
    parameters: {
      type: "object",
      properties: {
        max_tasks: { type: "string", description: "Maximum number of tasks to add to today (default 5, max 10)" },
        available_hours: { type: "string", description: "Optional. Hours available today; the plan's total estimated time (sum of task durations) will not exceed this." },
      },
    },
  },

  {
    name: "reorganize_matrix",
    description: "Move multiple tasks to new quadrants at once. Use when the user asks to reorganize, reclassify, or bulk-move tasks.",
    parameters: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          description: "Array of quadrant changes",
          items: {
            type: "object",
            properties: {
              id:           { type: "string", description: "Task ID from list_tasks" },
              new_quadrant: { type: "string", description: "New quadrant to move to", enum: ["Q1", "Q2", "Q3", "Q4", "unclassified"] },
            },
            required: ["id", "new_quadrant"],
          },
        },
      },
      required: ["changes"],
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────

export async function executeTool(
  tool: ToolCall,
  jwt: string,
  locale: string,
): Promise<string> {
  // Read the port at call time (not module load) so the loopback target tracks
  // the actually-bound port — the real server uses PORT; tests set LUMO_PORT.
  const port = process.env.PORT ?? process.env.LUMO_PORT ?? "47291";
  const base = `http://127.0.0.1:${port}/v1`;
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${jwt}`,
    "Content-Type": "application/json",
  };

  async function api(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    let data: unknown;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
    return data;
  }

  function taskTitle(t: any): string {
    return t.title?.[locale] ?? t.title?.en ?? (typeof t.title === "string" ? t.title : "?");
  }

  // GET /tasks is keyset-paginated ({ items, nextCursor }); page through to
  // assemble the full task set the AI tools reason over (heavy users span
  // multiple pages). Bounded per request; hard page cap guards a runaway loop.
  async function listAllTasks(): Promise<any[]> {
    const base = "/tasks?limit=200";
    const out: any[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 1000; page++) {
      const path = cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base;
      const res = (await api("GET", path)) as { items: any[]; nextCursor: string | null };
      out.push(...res.items);
      if (res.nextCursor == null) return out;
      cursor = res.nextCursor;
    }
    return out;
  }

  const a = tool.args;

  switch (tool.name) {

    // ── Tasks ──────────────────────────────────────────────────────────────

    case "list_tasks": {
      const tasks = await listAllTasks();
      let filtered = tasks;
      if (a.quadrant) filtered = filtered.filter((t) => t.quadrant === a.quadrant);
      if (a.today_only === "true") filtered = filtered.filter((t) => t.today);
      return JSON.stringify(filtered.map((t) => ({
        id: t.id,
        title: taskTitle(t),
        quadrant: t.quadrant,
        today: t.today,
        due: t.due ?? null,
        duration: t.duration ?? null,
        recurrence: t.recurrence ?? "none",
      })));
    }

    case "create_task": {
      const body: Record<string, unknown> = {
        title: { en: String(a.title), ...(locale === "zh" ? { zh: String(a.title) } : {}) },
        quadrant: (a.quadrant as string) || "Q2",
        today: a.today === "true",
      };
      if (a.due) body.due = String(a.due);
      if (a.duration) body.duration = Math.max(0, parseInt(String(a.duration), 10) || 0);
      if (a.recurrence) body.recurrence = a.recurrence;
      const result = await api("POST", "/tasks", body) as any;
      return JSON.stringify({ created: true, id: result.id, title: taskTitle(result) });
    }

    case "update_task": {
      const patch: Record<string, unknown> = {};
      if (a.title !== undefined)      patch.title    = { en: String(a.title), ...(locale === "zh" ? { zh: String(a.title) } : {}) };
      if (a.quadrant !== undefined)   patch.quadrant = a.quadrant;
      if (a.today !== undefined)      patch.today    = a.today === "true";
      if (a.due !== undefined)        patch.due      = a.due || null;
      if (a.duration !== undefined)   patch.duration = Math.max(0, parseInt(String(a.duration), 10) || 0);
      if (a.recurrence !== undefined) patch.recurrence = a.recurrence;
      const result = await api("PATCH", `/tasks/${a.id}`, patch) as any;
      return JSON.stringify({ updated: true, id: result.id, title: taskTitle(result) });
    }

    case "complete_task": {
      await api("POST", `/tasks/${a.id}/complete`, {});
      return JSON.stringify({ completed: true, id: a.id });
    }

    case "delete_task": {
      await api("DELETE", `/tasks/${a.id}`);
      return JSON.stringify({ deleted: true, id: a.id });
    }

    case "list_completed": {
      const limit = Math.min(50, parseInt(String(a.limit ?? "10"), 10) || 10);
      const entries = await api("GET", "/completed") as any[];
      return JSON.stringify(
        entries.slice(0, limit).map((e) => ({
          log_id: e.id,
          title: e.title?.[locale] ?? e.title?.en ?? e.title,
          completed_at: e.completedAt,
          duration: e.duration,
          quadrant: e.quadrant,
        }))
      );
    }

    case "uncomplete_task": {
      await api("POST", `/completed/${a.log_id}/reopen`);
      return JSON.stringify({ reopened: true, log_id: a.log_id });
    }

    // ── People ─────────────────────────────────────────────────────────────

    case "list_people": {
      // GET /people is keyset-paginated ({ items, nextCursor }); page through.
      const people: any[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 1000; page++) {
        const path = cursor ? `/people?limit=200&cursor=${encodeURIComponent(cursor)}` : "/people?limit=200";
        const res = (await api("GET", path)) as { items: any[]; nextCursor: string | null };
        people.push(...res.items);
        if (res.nextCursor == null) break;
        cursor = res.nextCursor;
      }
      return JSON.stringify(people.map((p) => ({
        id: p.id, name: p.name, initials: p.initials, color: p.color, email: p.email,
      })));
    }

    case "create_person": {
      const body = {
        name: String(a.name),
        initials: String(a.initials).slice(0, 3).toUpperCase(),
        color: a.color ?? "#6366f1",
        email: a.email ?? null,
      };
      const result = await api("POST", "/people", body) as any;
      return JSON.stringify({ created: true, id: result.id, name: result.name });
    }

    case "update_person": {
      const patch: Record<string, unknown> = {};
      if (a.name !== undefined)     patch.name     = a.name;
      if (a.initials !== undefined) patch.initials = String(a.initials).slice(0, 3).toUpperCase();
      if (a.color !== undefined)    patch.color    = a.color;
      if (a.email !== undefined)    patch.email    = a.email;
      const result = await api("PATCH", `/people/${a.id}`, patch) as any;
      return JSON.stringify({ updated: true, id: result.id, name: result.name });
    }

    case "delete_person": {
      await api("DELETE", `/people/${a.id}`);
      return JSON.stringify({ deleted: true, id: a.id });
    }

    // ── Stats ──────────────────────────────────────────────────────────────

    case "get_focus_stats": {
      const today = new Date().toISOString().slice(0, 10);
      const [allEntries, allTasks] = await Promise.all([
        api("GET", "/completed") as Promise<any[]>,
        listAllTasks(),
      ]);
      const todayEntries = (allEntries as any[]).filter((e) => (e.completedAt ?? "").startsWith(today));
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEntries = (allEntries as any[]).filter((e) => new Date(e.completedAt) >= weekStart);
      const focusMinWeek = weekEntries.reduce((s: number, e: any) => s + (e.duration ?? 0), 0);
      return JSON.stringify({
        today_completed: todayEntries.length,
        week_completed: weekEntries.length,
        week_focus_minutes: focusMinWeek,
        active_tasks: (allTasks as any[]).length,
        q1_active: (allTasks as any[]).filter((t: any) => t.quadrant === "Q1").length,
      });
    }

    // ── AI helpers ─────────────────────────────────────────────────────────

    case "classify_tasks": {
      const result = await api("POST", "/ai/classify") as any;
      return JSON.stringify({ classified: (result?.suggestions ?? []).length, suggestions: result?.suggestions ?? [] });
    }

    case "get_recommended_task": {
      const result = await api("POST", "/ai/recommend") as any;
      if (!result?.task) return JSON.stringify({ task: null, message: "No Q1 tasks in today's plan" });
      return JSON.stringify({ task: { id: result.task.id, title: taskTitle(result.task), conviction: result.task.conviction } });
    }

    // ── Batch / bulk operations ────────────────────────────────────────────

    case "batch_create_tasks": {
      const items = Array.isArray(a.tasks) ? a.tasks : [];
      const created: { id: string; title: string }[] = [];
      for (const item of items.slice(0, 20)) {
        if (!item.title) continue;
        const body: Record<string, unknown> = {
          title: { en: String(item.title), ...(locale === "zh" ? { zh: String(item.title) } : {}) },
          quadrant: (item.quadrant as string) || "Q2",
          today: item.today === "true",
        };
        if (item.due) body.due = String(item.due);
        const result = await api("POST", "/tasks", body) as any;
        created.push({ id: result.id, title: taskTitle(result) });
      }
      return JSON.stringify({ created: created.length, tasks: created });
    }

    case "search_tasks": {
      const query = String(a.query ?? "").toLowerCase().trim();
      if (!query) return JSON.stringify({ results: [] });
      const allTasks = await listAllTasks();
      const results = allTasks.filter((t) => {
        const title = taskTitle(t).toLowerCase();
        return title.includes(query);
      }).slice(0, 10).map((t) => ({
        id: t.id,
        title: taskTitle(t),
        quadrant: t.quadrant,
        today: t.today,
        due: t.due ?? null,
      }));
      if (a.include_completed === "true") {
        const completed = await api("GET", "/completed") as any[];
        const compResults = completed.filter((e) => {
          const title = (e.title?.[locale] ?? e.title?.en ?? e.title ?? "").toLowerCase();
          return title.includes(query);
        }).slice(0, 5).map((e) => ({
          log_id: e.id,
          title: e.title?.[locale] ?? e.title?.en ?? e.title,
          completed_at: e.completedAt,
        }));
        return JSON.stringify({ results, recently_completed: compResults });
      }
      return JSON.stringify({ results });
    }

    case "generate_today_plan": {
      const maxTasks = Math.min(10, parseInt(String(a.max_tasks ?? "5"), 10) || 5);
      const rawHours = a.available_hours != null ? parseFloat(String(a.available_hours)) : NaN;
      const availableHours = Number.isFinite(rawHours) && rawHours > 0 ? rawHours : null;
      const allTasks = await listAllTasks();
      const notToday = allTasks.filter((t) => !t.today && !t.completed);
      const toAdd = selectTodayPlan(notToday, { maxTasks, availableHours });
      const added: { id: string; title: string; quadrant: string }[] = [];
      let plannedMinutes = 0;
      for (const task of toAdd) {
        await api("PATCH", `/tasks/${task.id}`, { today: true });
        plannedMinutes += planTaskMinutes(task);
        added.push({ id: task.id, title: taskTitle(task), quadrant: task.quadrant });
      }
      return JSON.stringify({
        added: added.length,
        tasks: added,
        ...(availableHours != null
          ? { planned_minutes: plannedMinutes, budget_minutes: Math.round(availableHours * 60) }
          : {}),
      });
    }

    case "reorganize_matrix": {
      const changes = Array.isArray(a.changes) ? a.changes : [];
      const updated: { id: string; new_quadrant: string }[] = [];
      for (const change of changes.slice(0, 50)) {
        if (!change.id || !change.new_quadrant) continue;
        await api("PATCH", `/tasks/${change.id}`, { quadrant: change.new_quadrant });
        updated.push({ id: change.id, new_quadrant: change.new_quadrant });
      }
      return JSON.stringify({ updated: updated.length, changes: updated });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${tool.name}` });
  }
}
