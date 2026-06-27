import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import type { FieldError } from "@lumo/contracts";

/**
 * Project-wide request validator.
 *
 * `@hono/zod-validator`'s default failure handler responds with its OWN shape
 * (`{ success: false, error: <ZodError>, data }`), which does NOT match our
 * `{ error: { code, message, fields? } }` envelope — so clients could not read
 * the reason and fell back to a useless "HTTP 400". This wrapper bakes in a
 * hook that normalizes every validation failure into the canonical envelope
 * with code `VALIDATION_ERROR`, a complete English message that names each
 * offending field and why, and a structured `fields` array the frontend can use
 * to render inline messages under the right input.
 *
 * All routes import `validate` instead of `zValidator` directly (enforced by a
 * standards test) so no validation failure can ever bypass this normalization.
 *
 * `validate` deliberately keeps the exact call signature and return type of
 * `zValidator` (`as typeof zValidator`) so downstream `c.req.valid(...)` stays
 * fully typed; only the failure hook is fixed.
 */
function validationFailureHook(
  result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] }; target: string },
  c: Context,
) {
  if (!result.success && result.error) {
    const fields: FieldError[] = result.error.issues.map((issue) => ({
      // The dotted field path (e.g. "password"); empty paths fall back to the
      // validation target (json/param/query) so the frontend can still map it.
      path: issue.path.length > 0 ? issue.path.map(String).join(".") : result.target,
      message: issue.message,
    }));
    const message =
      fields.map((f) => (f.path ? `${f.path}: ${f.message}` : f.message)).join("; ") ||
      "Validation failed";
    return c.json({ error: { code: "VALIDATION_ERROR", message, fields } }, 400);
  }
}

export const validate = ((target: never, schema: never) =>
  zValidator(target, schema, validationFailureHook as never)) as typeof zValidator;
