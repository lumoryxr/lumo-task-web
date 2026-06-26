/**
 * @lumo/contracts — single source of truth for the Lumo API protocol.
 *
 * Contract-First rule: any change to an API request/response shape starts by
 * editing the Zod schema here, then flows to the backend implementation and the
 * frontend types. Never redefine these shapes in a route or in web-app/src/types.
 */

export * from "./primitives.js";
export * from "./task.js";
export * from "./person.js";
export * from "./error.js";
export * from "./ai.js";
export {
  zodToOpenApi,
  taskComponentSchemas,
  personComponentSchemas,
  errorComponentSchemas,
} from "./openapi.js";
