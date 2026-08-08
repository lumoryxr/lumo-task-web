import { z } from "zod";
import {
  TaskWireSchema,
  TaskCreateBodySchema,
  TaskUpdateBodySchema,
  TaskCompleteResponseSchema,
} from "./task.js";
import {
  PersonWireSchema,
  PersonCreateBodySchema,
  PersonUpdateBodySchema,
} from "./person.js";
import { ApiErrorSchema } from "./error.js";
import {
  UserProfileWireSchema,
  DataExportWireSchema,
  DeleteAccountResponseSchema,
} from "./user.js";
import { LocalizedStringSchema, LongLocalizedStringSchema } from "./primitives.js";

/**
 * Minimal, dependency-free Zod → OpenAPI 3 converter.
 *
 * It only needs to cover the node types our contracts actually use
 * (object / string / number / boolean / enum / array / optional / nullable /
 * default). The point is that the OpenAPI document is *derived from the Zod
 * schema*, so the published docs can never drift from validation/implementation.
 * When more node types are needed, extend `toOpenApi` rather than hand-writing
 * a parallel schema.
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
      return { schema: out, optional: false };
    }
    case "ZodArray":
      return { schema: { type: "array", items: toOpenApi(def.type).schema }, optional: false };
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
      return { schema: { type: def.checks?.some((c: any) => c.kind === "int") ? "integer" : "number" }, optional: false };
    case "ZodBoolean":
      return { schema: { type: "boolean" }, optional: false };
    case "ZodCatch": {
      // ZodCatch wraps a fallback value — treat the inner type as optional
      // so the field is not listed as required (the catch means it always has a value).
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

/**
 * Component schemas generated from the Task contract. Spread these into an
 * OpenAPI document's `components.schemas` so Swagger reflects the real shapes.
 */
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

/** Component schemas generated from the Person contract. */
export function personComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    Person: zodToOpenApi(PersonWireSchema),
    PersonCreateBody: zodToOpenApi(PersonCreateBodySchema),
    PersonUpdateBody: zodToOpenApi(PersonUpdateBodySchema),
  };
}

/** The shared error envelope, generated from the contract. */
export function errorComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    ApiError: zodToOpenApi(ApiErrorSchema),
  };
}

/** Component schemas generated from the User contract. */
export function userComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    User: zodToOpenApi(UserProfileWireSchema),
    DataExport: zodToOpenApi(DataExportWireSchema),
    DeleteAccountResponse: zodToOpenApi(DeleteAccountResponseSchema),
  };
}
