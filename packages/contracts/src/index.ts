/**
 * @lumo/contracts — single source of truth for the Lumo API protocol.
 *
 * Contract-First rule: any change to an API request/response shape starts by
 * editing the Zod schema here, then flows to the backend implementation and the
 * frontend types. Never redefine these shapes in a route or in web-app/src/types.
 *
 * The package owns two layers:
 *   • the per-domain **schemas** (task, person, auth, …) — what a request and a
 *     response look like; and
 *   • the **route registry** (`registry.ts`) — which endpoints exist, what each
 *     one accepts and returns, and how it authenticates.
 *
 * The registry is what makes design ≡ runtime enforceable: the OpenAPI document
 * is generated from it, and a parity test diffs it against the routes the Hono
 * app actually mounts, failing in both directions.
 */

export * from "./primitives.js";
export * from "./task.js";
export * from "./person.js";
export * from "./project.js";
export * from "./habit.js";
export * from "./countdown.js";
export * from "./template.js";
export * from "./feedback.js";
export * from "./error.js";
export * from "./ai.js";
export * from "./auth.js";
export * from "./settings.js";
export * from "./focus.js";
export * from "./storage.js";
export * from "./calendar.js";
export * from "./sync.js";
export * from "./user.js";
export * from "./registry.js";
export {
  zodToOpenApi,
  buildOpenApiDocument,
  toOpenApiPath,
  taskComponentSchemas,
  personComponentSchemas,
  errorComponentSchemas,
  userComponentSchemas,
  feedbackComponentSchemas,
} from "./openapi.js";
export type { OpenApiDocumentOptions } from "./openapi.js";
