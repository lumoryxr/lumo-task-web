import { z } from "zod";
import {
  TaskWireSchema,
  TaskCreateBodySchema,
  TaskUpdateBodySchema,
  TaskCompleteResponseSchema,
  TaskListResponseSchema,
} from "./task.js";
import {
  PersonWireSchema,
  PersonCreateBodySchema,
  PersonUpdateBodySchema,
  PersonListResponseSchema,
} from "./person.js";
import { ApiErrorSchema } from "./error.js";
import {
  FeedbackWireSchema,
  AdminFeedbackWireSchema,
  CreateFeedbackBodySchema,
  UpdateFeedbackObjectSchema,
  FeedbackListResponseSchema,
} from "./feedback.js";
import {
  UserProfileWireSchema,
  DataExportWireSchema,
  DeleteAccountResponseSchema,
} from "./user.js";
import {
  ProjectWireSchema,
  ProjectCreateBodySchema,
  ProjectUpdateBodySchema,
  ProjectListResponseSchema,
} from "./project.js";
import {
  HabitWireSchema,
  HabitLogWireSchema,
  HabitCreateBodySchema,
  HabitUpdateBodySchema,
  HabitListResponseSchema,
} from "./habit.js";
import {
  CountdownWireSchema,
  CountdownCreateBodySchema,
  CountdownUpdateBodySchema,
  CountdownListResponseSchema,
} from "./countdown.js";
import { TemplateWireSchema } from "./template.js";
import { SettingsWireSchema, SettingsPatchBodySchema } from "./settings.js";
import { CompletedEntryWireSchema, CompletedListResponseSchema } from "./focus.js";
import { StorageInfoWireSchema } from "./storage.js";
import { AuthSessionWireSchema } from "./auth.js";
import { LocalizedStringSchema, LongLocalizedStringSchema } from "./primitives.js";
import { API_ROUTES, type RouteDef, type ResponseDef, type AuthMode } from "./registry.js";

/**
 * Minimal, dependency-free Zod → OpenAPI 3 converter, plus the generator that
 * turns the {@link API_ROUTES} registry into a complete OpenAPI document.
 *
 * The converter only needs to cover the node types our contracts actually use.
 * The point is that the OpenAPI document is *derived from the Zod schemas*, so
 * the published docs can never drift from validation/implementation. When more
 * node types are needed, extend `toOpenApi` rather than hand-writing a parallel
 * schema.
 */

type OpenApiSchema = Record<string, unknown>;

function toOpenApi(schema: z.ZodTypeAny): { schema: OpenApiSchema; optional: boolean } {
  const def: any = (schema as any)._def;
  const typeName: string = def?.typeName;

  switch (typeName) {
    case "ZodOptional": {
      const inner = toOpenApi(def.innerType);
      return { schema: inner.schema, optional: true };
    }
    case "ZodDefault": {
      const inner = toOpenApi(def.innerType);
      return { schema: inner.schema, optional: true };
    }
    case "ZodNullable": {
      const inner = toOpenApi(def.innerType);
      return { schema: { ...inner.schema, nullable: true }, optional: inner.optional };
    }
    case "ZodObject": {
      const shape = def.shape();
      const properties: Record<string, OpenApiSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        const child = toOpenApi(value as z.ZodTypeAny);
        properties[key] = child.schema;
        if (!child.optional) required.push(key);
      }
      const out: OpenApiSchema = { type: "object", properties };
      if (required.length) out.required = required;
      // `.strict()` — an unknown key is a client bug, so say so in the docs.
      if (def.unknownKeys === "strict") out.additionalProperties = false;
      return { schema: out, optional: false };
    }
    case "ZodArray":
      return { schema: { type: "array", items: toOpenApi(def.type).schema }, optional: false };
    case "ZodRecord":
      return {
        schema: { type: "object", additionalProperties: toOpenApi(def.valueType).schema },
        optional: false,
      };
    case "ZodUnion": {
      const options: z.ZodTypeAny[] = def.options;
      return { schema: { oneOf: options.map((o) => toOpenApi(o).schema) }, optional: false };
    }
    case "ZodEnum":
      return { schema: { type: "string", enum: def.values }, optional: false };
    case "ZodLiteral": {
      const v = def.value;
      const t = typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : "string";
      return { schema: { type: t, enum: [v] }, optional: false };
    }
    case "ZodString":
      return { schema: { type: "string" }, optional: false };
    case "ZodNumber":
      return {
        schema: { type: def.checks?.some((c: any) => c.kind === "int") ? "integer" : "number" },
        optional: false,
      };
    case "ZodBoolean":
      return { schema: { type: "boolean" }, optional: false };
    case "ZodUnknown":
    case "ZodAny":
      return { schema: {}, optional: false };
    case "ZodEffects":
      // `.refine()` / `.transform()` — document the underlying shape. The
      // refinement itself is a runtime rule with no OpenAPI equivalent.
      return toOpenApi(def.schema);
    case "ZodCatch": {
      // ZodCatch wraps a fallback value — treat the inner type as optional so
      // the field is not listed as required (the catch means it always has one).
      const inner = toOpenApi(def.innerType);
      return { schema: inner.schema, optional: true };
    }
    default:
      // Unknown node — emit a permissive object so docs still render.
      return { schema: {}, optional: false };
  }
}

/** Convert a Zod schema to an OpenAPI 3 schema object. */
export function zodToOpenApi(schema: z.ZodTypeAny): OpenApiSchema {
  return toOpenApi(schema).schema;
}

// ── Named components ──────────────────────────────────────────────────────────

/**
 * Schemas that get a name under `components.schemas` and are referenced by
 * `$ref` everywhere they appear. Everything else is inlined at the use site.
 *
 * The mapping is by object identity, so a route that references the *same*
 * exported schema automatically gets the `$ref` — there is no name string to
 * keep in sync.
 */
const NAMED_SCHEMAS: ReadonlyArray<readonly [string, z.ZodTypeAny]> = [
  ["LocalizedString", LocalizedStringSchema],
  ["LongLocalizedString", LongLocalizedStringSchema],
  ["ApiError", ApiErrorSchema],

  ["Task", TaskWireSchema],
  ["TaskCreateBody", TaskCreateBodySchema],
  ["TaskUpdateBody", TaskUpdateBodySchema],
  ["TaskCompleteResponse", TaskCompleteResponseSchema],
  ["TaskListResponse", TaskListResponseSchema],

  ["Person", PersonWireSchema],
  ["PersonCreateBody", PersonCreateBodySchema],
  ["PersonUpdateBody", PersonUpdateBodySchema],
  ["PersonListResponse", PersonListResponseSchema],

  ["Project", ProjectWireSchema],
  ["ProjectCreateBody", ProjectCreateBodySchema],
  ["ProjectUpdateBody", ProjectUpdateBodySchema],
  ["ProjectListResponse", ProjectListResponseSchema],

  ["Habit", HabitWireSchema],
  ["HabitLog", HabitLogWireSchema],
  ["HabitCreateBody", HabitCreateBodySchema],
  ["HabitUpdateBody", HabitUpdateBodySchema],
  ["HabitListResponse", HabitListResponseSchema],

  ["Countdown", CountdownWireSchema],
  ["CountdownCreateBody", CountdownCreateBodySchema],
  ["CountdownUpdateBody", CountdownUpdateBodySchema],
  ["CountdownListResponse", CountdownListResponseSchema],

  ["Template", TemplateWireSchema],

  ["CompletedEntry", CompletedEntryWireSchema],
  ["CompletedListResponse", CompletedListResponseSchema],

  ["Settings", SettingsWireSchema],
  ["SettingsPatchBody", SettingsPatchBodySchema],

  ["StorageInfo", StorageInfoWireSchema],

  ["User", UserProfileWireSchema],
  ["DataExport", DataExportWireSchema],
  ["DeleteAccountResponse", DeleteAccountResponseSchema],
  ["AuthSession", AuthSessionWireSchema],

  ["Feedback", FeedbackWireSchema],
  ["AdminFeedback", AdminFeedbackWireSchema],
  ["FeedbackCreateBody", CreateFeedbackBodySchema],
  ["FeedbackUpdateBody", UpdateFeedbackObjectSchema],
  ["FeedbackListResponse", FeedbackListResponseSchema],
];

const schemaNames = new Map<z.ZodTypeAny, string>(
  NAMED_SCHEMAS.map(([name, schema]) => [schema, name] as const),
);

/** `$ref` if the schema is a named component, otherwise the inlined schema. */
function refOrInline(schema: z.ZodTypeAny): OpenApiSchema {
  const name = schemaNames.get(schema);
  return name ? { $ref: `#/components/schemas/${name}` } : zodToOpenApi(schema);
}

// ── Legacy per-domain component helpers ───────────────────────────────────────
// Retained because they are the documented extension point for a domain that
// wants its schemas published without a route entry yet. `buildOpenApiDocument`
// no longer needs them — it derives components from NAMED_SCHEMAS.

export function taskComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    LocalizedString: zodToOpenApi(LocalizedStringSchema),
    LongLocalizedString: zodToOpenApi(LongLocalizedStringSchema),
    Task: zodToOpenApi(TaskWireSchema),
    TaskCreateBody: zodToOpenApi(TaskCreateBodySchema),
    TaskUpdateBody: zodToOpenApi(TaskUpdateBodySchema),
    TaskCompleteResponse: zodToOpenApi(TaskCompleteResponseSchema),
  };
}

export function personComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    Person: zodToOpenApi(PersonWireSchema),
    PersonCreateBody: zodToOpenApi(PersonCreateBodySchema),
    PersonUpdateBody: zodToOpenApi(PersonUpdateBodySchema),
  };
}

export function errorComponentSchemas(): Record<string, OpenApiSchema> {
  return { ApiError: zodToOpenApi(ApiErrorSchema) };
}

export function feedbackComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    Feedback: zodToOpenApi(FeedbackWireSchema),
    AdminFeedback: zodToOpenApi(AdminFeedbackWireSchema),
    FeedbackCreateBody: zodToOpenApi(CreateFeedbackBodySchema),
    FeedbackUpdateBody: zodToOpenApi(UpdateFeedbackObjectSchema),
    FeedbackListResponse: zodToOpenApi(FeedbackListResponseSchema),
  };
}

export function userComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    User: zodToOpenApi(UserProfileWireSchema),
    DataExport: zodToOpenApi(DataExportWireSchema),
    DeleteAccountResponse: zodToOpenApi(DeleteAccountResponseSchema),
  };
}

// ── Document generation ───────────────────────────────────────────────────────

/** `/v1/tasks/:id` → `/v1/tasks/{id}` (Hono style → OpenAPI style). */
export function toOpenApiPath(honoPath: string): string {
  return honoPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/** Path-parameter names in mount order, e.g. `["id", "date"]`. */
function pathParams(honoPath: string): string[] {
  return [...honoPath.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]);
}

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
});

function buildResponses(route: RouteDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const r of route.responses as ResponseDef[]) {
    const contentType = r.contentType ?? "application/json";
    const entry: Record<string, unknown> = { description: r.description };
    if (r.schema) {
      entry.content = { [contentType]: { schema: refOrInline(r.schema) } };
    } else if (r.contentType) {
      entry.content = { [contentType]: { schema: { type: "string" } } };
    } else if (r.status >= 400) {
      entry.content = { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } };
    }
    out[String(r.status)] = entry;
  }

  // Universal failures, appended so every operation documents the same envelope
  // rather than each entry restating them. Never overwrite an explicit entry.
  if (route.request || route.query) {
    out["400"] ??= errorResponse("Validation failed — see `error.fields` for the offending inputs");
  }
  if (route.auth !== "public" && route.auth !== "feed-token") {
    out["401"] ??= errorResponse("Missing, malformed, or expired bearer token");
  }
  out["500"] ??= errorResponse(
    "Unhandled server fault. The response carries a `requestId` that appears in the server logs.",
  );

  return out;
}

function securityFor(auth: AuthMode): unknown[] | undefined {
  // `feed-token` carries its credential in the query string, which the operation
  // documents as a parameter rather than a security scheme.
  return auth === "public" || auth === "feed-token" ? undefined : [{ bearerAuth: [] }];
}

function buildOperation(route: RouteDef): Record<string, unknown> {
  const op: Record<string, unknown> = {
    tags: [route.tag],
    summary: route.summary,
    operationId: `${route.method}${toOpenApiPath(route.path)
      .replace(/[^A-Za-z0-9]+(.)/g, (_m, c: string) => c.toUpperCase())
      .replace(/[^A-Za-z0-9]/g, "")}`,
  };
  if (route.description) op.description = route.description;

  const parameters: unknown[] = pathParams(route.path).map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));

  if (route.query) {
    const q = zodToOpenApi(route.query) as {
      properties?: Record<string, OpenApiSchema>;
      required?: string[];
    };
    for (const [name, schema] of Object.entries(q.properties ?? {})) {
      parameters.push({
        name,
        in: "query",
        required: (q.required ?? []).includes(name),
        schema,
      });
    }
  }

  if (route.auth === "feed-token") {
    parameters.push({
      name: "token",
      in: "query",
      required: true,
      description: "The user's unguessable, rotatable calendar-feed token.",
      schema: { type: "string" },
    });
  }

  if (parameters.length) op.parameters = parameters;

  if (route.request) {
    op.requestBody = {
      required: true,
      content: { "application/json": { schema: refOrInline(route.request) } },
    };
  }

  const security = securityFor(route.auth);
  if (security) op.security = security;

  op.responses = buildResponses(route);
  return op;
}

export interface OpenApiDocumentOptions {
  /** Overrides the default `version` in `info`. */
  version?: string;
  /** Overrides the default single relative server entry. */
  servers?: Array<{ url: string; description?: string }>;
}

/**
 * Build the complete OpenAPI 3.0.3 document from {@link API_ROUTES}.
 *
 * This is the ONLY place an OpenAPI document is produced: the backend serves its
 * output at `GET /docs/openapi.json` and the `gen:openapi` script writes the
 * same bytes to `docs/api/openapi.json`. There is no hand-written spec to drift.
 */
export function buildOpenApiDocument(options: OpenApiDocumentOptions = {}): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of API_ROUTES) {
    const p = toOpenApiPath(route.path);
    (paths[p] ??= {})[route.method] = buildOperation(route);
  }

  const schemas: Record<string, OpenApiSchema> = {};
  for (const [name, schema] of NAMED_SCHEMAS) {
    schemas[name] = zodToOpenApi(schema);
  }

  const tags = [...new Set(API_ROUTES.map((r) => r.tag))].map((name) => ({ name }));

  return {
    openapi: "3.0.3",
    info: {
      title: "Lumo Task API",
      version: options.version ?? "1.0.0",
      description:
        "REST API for Lumo Task — an Eisenhower-matrix task manager.\n\n" +
        "**This document is generated** from the route registry in `@lumo/contracts` " +
        "(`src/registry.ts`) and the Zod schemas it references. It is never hand-edited, " +
        "and a parity test fails the build if it stops matching the routes the server " +
        "actually mounts.\n\n" +
        "**Authentication:** every `/v1/*` route requires a Bearer token except the auth " +
        "and OAuth handshake endpoints. Call `POST /v1/auth/signin` to obtain one, then " +
        "click **Authorize** and paste it.\n\n" +
        "**Errors** all share one envelope: `{ error: { code, message, fields? } }`.",
    },
    servers: options.servers ?? [{ url: "/", description: "This server" }],
    tags,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas,
    },
    paths,
  };
}
