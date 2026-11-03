import { z } from "zod";

/**
 * Shared primitive schemas. These are the single source of truth reused by
 * every domain contract (request bodies + wire responses) and by the
 * generated OpenAPI document.
 */

export const LocalizedStringSchema = z.object({
  en: z.string().max(500),
  zh: z.string().max(500).optional(),
});

export const LongLocalizedStringSchema = z.object({
  en: z.string().max(2000),
  zh: z.string().max(2000).optional(),
});

export const QuadrantSchema = z.enum(["Q1", "Q2", "Q3", "Q4", "unclassified"]);

export const RecurrenceSchema = z.enum(["none", "daily", "weekdays", "weekly", "monthly"]);

export type LocalizedString = z.infer<typeof LocalizedStringSchema>;
export type LongLocalizedString = z.infer<typeof LongLocalizedStringSchema>;
export type Quadrant = z.infer<typeof QuadrantSchema>;
export type TaskRecurrence = z.infer<typeof RecurrenceSchema>;

// ── PATCH bodies ──────────────────────────────────────────────────────────────

/** A field with any create-time `.default()` peeled off. */
type WithoutDefault<S> =
  S extends z.ZodDefault<infer Inner>
    ? Inner
    : S extends z.ZodPipe<z.ZodDefault<infer Inner>, infer Out>
      ? z.ZodPipe<Inner, Out>
      : S;

/** Remove a field's create-time `.default()`, keeping every other rule. */
function withoutDefault(field: z.ZodType): z.ZodType {
  if (field instanceof z.ZodDefault) return field.unwrap() as z.ZodType;
  // `.default(x).transform(fn)` — keep the transform, drop the default.
  if (field instanceof z.ZodPipe && field.in instanceof z.ZodDefault) {
    return (field.in.unwrap() as z.ZodType).pipe(field.out as z.ZodType);
  }
  return field;
}

/**
 * Derive a PATCH body from a create body: every field becomes optional and
 * **no default is ever filled in**.
 *
 * A PATCH carries only the fields the client sent, and the backend treats a
 * present key as "overwrite this column". Zod 4 applies `.default()` even inside
 * `.partial()`, so `CreateBody.partial()` would turn `{ title }` into
 * `{ title, quadrant: "unclassified", today: false, … }` and silently reset
 * every column the client did not touch. Use this instead of `.partial()` for
 * any update schema derived from a create schema.
 */
export function patchBodyOf<Shape extends z.ZodRawShape>(create: z.ZodObject<Shape>) {
  const stripped: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(create.shape)) {
    stripped[key] = withoutDefault(field as z.ZodType);
  }
  // `.extend()` keeps the object's config (e.g. `.strict()`), then `.partial()`
  // makes every key optional.
  return create.extend(stripped).partial() as unknown as z.ZodObject<
    { [K in keyof Shape]: z.ZodOptional<WithoutDefault<Shape[K]>> }
  >;
}
