import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { taskComponentSchemas, personComponentSchemas, errorComponentSchemas } from "@lumo/contracts";

const app = new Hono();

// OpenAPI 3.0 spec
const spec = {
  openapi: "3.0.3",
  info: {
    title: "Lumo Task API",
    version: "1.0.0",
    description: "REST API for Lumo Task — Eisenhower matrix task manager.\n\n" +
      "**Authentication:** All `/v1/*` routes (except `/v1/auth/register` and `/v1/auth/signin`) require a Bearer token.\n\n" +
      "Use `POST /v1/auth/signin` to obtain a token, then click **Authorize** and paste it.",
  },
  servers: [{ url: "/", description: "This server" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      // `Task`, `LocalizedString`, `LongLocalizedString` and `TaskCreateBody` are
      // generated from the @lumo/contracts Zod schemas — the single source of
      // truth — so the docs can never drift from validation/implementation.
      // (Contract-First: edit the contract, not this file, to change these.)
      ...taskComponentSchemas(),
      // Person / PersonCreateBody / PersonUpdateBody are generated from the
      // @lumo/contracts Zod schemas (Contract-First — edit the contract, not here).
      ...personComponentSchemas(),
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string" },
          name: { type: "string" },
          initials: { type: "string" },
          local: { type: "boolean" },
          plan: { type: "string", enum: ["free", "pro"] },
          renewsAt: { type: "string", nullable: true },
          stats: {
            type: "object",
            properties: {
              tasks: { type: "integer" },
              pomodoros: { type: "integer" },
              syncOK: { type: "boolean" },
            },
          },
        },
      },
      Settings: {
        type: "object",
        properties: {
          locale: { type: "string", enum: ["en", "zh"] },
          accent: { type: "string", enum: ["green", "cyan", "amber", "graphite"] },
          density: { type: "string", enum: ["comfortable", "compact"] },
          reduced_motion: { type: "boolean" },
          ai_enabled: { type: "boolean" },
          pomodoro_duration: { type: "integer" },
          short_break: { type: "integer" },
          long_break: { type: "integer" },
          long_break_interval: { type: "integer" },
          auto_start_breaks: { type: "boolean" },
          notifications_enabled: { type: "boolean" },
          onboarding_complete: { type: "boolean" },
          ai_provider: { type: "string", enum: ["openai", "deepseek", "claude", "custom"] },
          ai_api_key: { type: "string", nullable: true },
          ai_base_url: { type: "string", nullable: true },
          ai_model: { type: "string", nullable: true },
        },
      },
      CompletedEntry: {
        type: "object",
        properties: {
          id: { type: "string" },
          task_id: { type: "string", nullable: true },
          title: { $ref: "#/components/schemas/LocalizedString" },
          duration: { type: "integer" },
          quadrant: { type: "string", nullable: true },
          startedAt: { type: "string", nullable: true, format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
        },
      },
      // The real error envelope is { error: { code, message } } — generated as
      // `ApiError` from the contract (replaces the old, incorrect flat shape).
      ...errorComponentSchemas(),
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Liveness check (process up; does not touch the DB)",
        security: [],
        responses: {
          "200": { description: "Server is up", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
        },
      },
    },
    "/ready": {
      get: {
        tags: ["System"],
        summary: "Readiness check (verifies DB connectivity)",
        security: [],
        responses: {
          "200": { description: "Server can serve (DB reachable)", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, db: { type: "string" } } } } } },
          "503": { description: "Database unreachable", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, db: { type: "string" } } } } } },
        },
      },
    },

    // ── Auth ──────────────────────────────────────────────────────────────────
    "/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new account",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "name"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                  name: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" }, user: { $ref: "#/components/schemas/User" } } } } } },
          "400": { description: "Validation error" },
          "409": { description: "Email already registered" },
        },
      },
    },
    "/v1/auth/signin": {
      post: {
        tags: ["Auth"],
        summary: "Sign in and get a JWT token",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email", example: "user@example.com" },
                  password: { type: "string", example: "your-password" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Token + user", content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" }, user: { $ref: "#/components/schemas/User" } } } } } },
          "401": { description: "Invalid credentials" },
        },
      },
    },
    "/v1/auth/signout": {
      post: {
        tags: ["Auth"],
        summary: "Sign out (client-side token discard)",
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
        },
      },
    },
    "/v1/auth/change-password": {
      post: {
        tags: ["Auth"],
        summary: "Change current user's password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["current_password", "new_password"],
                properties: {
                  current_password: { type: "string" },
                  new_password: { type: "string", minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "OK" },
          "400": { description: "Current password wrong" },
          "401": { description: "Unauthorized" },
        },
      },
    },

    // ── User ──────────────────────────────────────────────────────────────────
    "/v1/user": {
      get: {
        tags: ["User"],
        summary: "Get current user profile",
        responses: {
          "200": { description: "User object", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
          "401": { description: "Unauthorized" },
        },
      },
    },

    // ── Settings ──────────────────────────────────────────────────────────────
    "/v1/settings": {
      get: {
        tags: ["Settings"],
        summary: "Get user settings",
        responses: {
          "200": { description: "Settings", content: { "application/json": { schema: { $ref: "#/components/schemas/Settings" } } } },
          "401": { description: "Unauthorized" },
        },
      },
      patch: {
        tags: ["Settings"],
        summary: "Update one or more settings fields",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Settings" },
            },
          },
        },
        responses: {
          "200": { description: "Updated settings", content: { "application/json": { schema: { $ref: "#/components/schemas/Settings" } } } },
          "401": { description: "Unauthorized" },
        },
      },
    },

    // ── Tasks ─────────────────────────────────────────────────────────────────
    "/v1/tasks": {
      get: {
        tags: ["Tasks"],
        summary: "List active (non-completed) tasks — keyset paginated",
        parameters: [
          { name: "q", in: "query", required: false, schema: { type: "string", maxLength: 200 }, description: "Keyword search over title/description (both locales)" },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 50 }, description: "Max items per page (default 50)" },
          { name: "cursor", in: "query", required: false, schema: { type: "string" }, description: "Opaque keyset cursor from a previous response's nextCursor" },
        ],
        responses: {
          "200": {
            description: "A page of tasks plus the next-page cursor (null on the last page)",
            content: { "application/json": { schema: {
              type: "object",
              required: ["items", "nextCursor"],
              properties: {
                items: { type: "array", items: { $ref: "#/components/schemas/Task" } },
                nextCursor: { type: "string", nullable: true },
              },
            } } },
          },
          "400": { description: "Invalid limit or cursor" },
          "401": { description: "Unauthorized" },
        },
      },
      post: {
        tags: ["Tasks"],
        summary: "Create a new task",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TaskCreateBody" },
            },
          },
        },
        responses: {
          "201": { description: "Created task", content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } } },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/v1/tasks/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Tasks"],
        summary: "Get a single task",
        responses: {
          "200": { description: "Task", content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } } },
          "401": { description: "Unauthorized" },
          "404": { description: "Not found" },
        },
      },
      patch: {
        tags: ["Tasks"],
        summary: "Partially update a task",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TaskUpdateBody" },
            },
          },
        },
        responses: {
          "200": { description: "Updated task", content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } } },
          "401": { description: "Unauthorized" },
          "404": { description: "Not found" },
        },
      },
      delete: {
        tags: ["Tasks"],
        summary: "Delete a task",
        responses: {
          "204": { description: "Deleted (no content)" },
          "401": { description: "Unauthorized" },
          "404": { description: "Not found" },
        },
      },
    },
    "/v1/tasks/{id}/complete": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      post: {
        tags: ["Tasks"],
        summary: "Mark a task as completed",
        responses: {
          "200": { description: "OK + completed entry id", content: { "application/json": { schema: { $ref: "#/components/schemas/TaskCompleteResponse" } } } },
          "401": { description: "Unauthorized" },
          "404": { description: "Not found" },
        },
      },
    },
    "/v1/tasks/{id}/uncomplete": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      post: {
        tags: ["Tasks"],
        summary: "Restore a completed task to active",
        responses: {
          "200": { description: "Restored task", content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } } },
          "401": { description: "Unauthorized" },
          "404": { description: "Not found" },
        },
      },
    },

    // ── People ────────────────────────────────────────────────────────────────
    "/v1/people": {
      get: {
        tags: ["People"],
        summary: "List all people",
        responses: {
          "200": { description: "People array", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Person" } } } } },
          "401": { description: "Unauthorized" },
        },
      },
      post: {
        tags: ["People"],
        summary: "Create a new person",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PersonCreateBody" },
            },
          },
        },
        responses: {
          "201": { description: "Created person", content: { "application/json": { schema: { $ref: "#/components/schemas/Person" } } } },
          "400": { description: "Validation error" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/v1/people/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      patch: {
        tags: ["People"],
        summary: "Update a person",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PersonUpdateBody" },
            },
          },
        },
        responses: {
          "200": { description: "Updated person", content: { "application/json": { schema: { $ref: "#/components/schemas/Person" } } } },
          "401": { description: "Unauthorized" },
          "404": { description: "Not found" },
        },
      },
      delete: {
        tags: ["People"],
        summary: "Delete a person (removes them from all task assignee_ids)",
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          "401": { description: "Unauthorized" },
          "404": { description: "Not found" },
        },
      },
    },

    // ── Completed ─────────────────────────────────────────────────────────────
    "/v1/completed": {
      get: {
        tags: ["Completed"],
        summary: "List completed entries — one day (array) or full history (keyset paginated)",
        parameters: [
          {
            name: "date",
            in: "query",
            required: false,
            schema: { type: "string", format: "date", example: "2026-05-19" },
            description: "Filter to entries completed on this local date (YYYY-MM-DD). Returns a plain array.",
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 500, default: 200 },
            description: "Page size for the no-date (paginated) form.",
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Opaque keyset cursor from a previous response's nextCursor (no-date form).",
          },
        ],
        responses: {
          "200": {
            description: "With ?date= a plain array; otherwise a paginated page.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { type: "array", items: { $ref: "#/components/schemas/CompletedEntry" } },
                    {
                      type: "object",
                      required: ["items", "nextCursor"],
                      properties: {
                        items: { type: "array", items: { $ref: "#/components/schemas/CompletedEntry" } },
                        nextCursor: { type: "string", nullable: true },
                      },
                    },
                  ],
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/v1/completed/{id}/reopen": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Completed entry ID" }],
      post: {
        tags: ["Completed"],
        summary: "Reopen a completed entry (restores the linked task if it still exists)",
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          "401": { description: "Unauthorized" },
          "404": { description: "Not found" },
        },
      },
    },

    // ── Focus ─────────────────────────────────────────────────────────────────
    "/v1/focus/sessions": {
      post: {
        tags: ["Focus"],
        summary: "Record a completed focus session (increments task pomos_done)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["duration"],
                properties: {
                  task_id: { type: "string", nullable: true, description: "Link session to a task" },
                  duration: { type: "integer", description: "Session length in minutes" },
                  started_at: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "OK + entry id", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, entry_id: { type: "string" } } } } } },
          "401": { description: "Unauthorized" },
        },
      },
    },

    // ── AI ────────────────────────────────────────────────────────────────────
    "/v1/ai/classify": {
      post: {
        tags: ["AI"],
        summary: "Heuristically classify all unclassified tasks into quadrants",
        responses: {
          "200": {
            description: "Suggestions array",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          task_id: { type: "string" },
                          quadrant: { type: "string" },
                          confidence: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/v1/ai/recommend": {
      post: {
        tags: ["AI"],
        summary: "Recommend the highest-priority Q1 task for today",
        responses: {
          "200": {
            description: "Recommended task (nullable)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    task: {
                      nullable: true,
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { $ref: "#/components/schemas/LocalizedString" },
                        quadrant: { type: "string" },
                        conviction: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/v1/ai/parse": {
      post: {
        tags: ["AI"],
        summary: "Parse natural language into a task scaffold (stub)",
        responses: {
          "200": {
            description: "Task scaffold",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    task: { $ref: "#/components/schemas/Task" },
                    confidence: { type: "number" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/v1/ai/chat": {
      post: {
        tags: ["AI"],
        summary: "Chat with Lumo pet AI (uses configured LLM or fallback canned replies)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["messages"],
                properties: {
                  messages: {
                    type: "array",
                    maxItems: 20,
                    items: {
                      type: "object",
                      required: ["role", "content"],
                      properties: {
                        role: { type: "string", enum: ["user", "assistant"] },
                        content: { type: "string" },
                      },
                    },
                  },
                  context: {
                    type: "object",
                    properties: {
                      page: { type: "string" },
                      q1Count: { type: "integer" },
                      locale: { type: "string", enum: ["en", "zh"] },
                      userName: { type: "string" },
                      todayTasks: { type: "array", items: { type: "object" } },
                      recentCompleted: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "AI reply + suggested pet mood",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reply: { type: "string" },
                    mood: { type: "string", enum: ["idle", "happy", "excited"] },
                    fallback: { type: "boolean", description: "true when no LLM key configured" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "502": { description: "LLM API error" },
        },
      },
    },
  },
};

// Serve OpenAPI JSON
app.get("/openapi.json", (c) => c.json(spec));

// Serve Swagger UI
app.get(
  "/",
  swaggerUI({ url: "/docs/openapi.json" }),
);

export default app;
