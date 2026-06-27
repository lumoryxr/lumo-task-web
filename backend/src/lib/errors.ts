import type { Context } from "hono";
import type { ErrorCode, FieldError } from "@lumo/contracts";

/**
 * Emit the canonical error envelope `{ error: { code, message, fields? } }`.
 *
 * `code` is constrained to the central {@link ErrorCode} registry so a typo or
 * an undeclared code fails the type-check rather than shipping silently. The
 * `message` should always be a complete, specific reason (English) — never a
 * bare restatement of the status.
 */
export function httpError(
  c: Context,
  status: number,
  code: ErrorCode,
  message: string,
  fields?: FieldError[],
) {
  const error: { code: ErrorCode; message: string; fields?: FieldError[] } = { code, message };
  if (fields && fields.length > 0) error.fields = fields;
  return c.json({ error }, status as any);
}
