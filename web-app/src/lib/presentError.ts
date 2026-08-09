import { t } from "@/i18n/useT";
import { toast } from "@/store/useToastStore";
import { ApiError } from "@/api/ApiError";
import type { FieldError } from "@lumo/contracts";

/**
 * The single entry point for surfacing an error to the user.
 *
 * Every catch site that wants to show a failure routes through here instead of
 * calling `toast.error(...)` ad hoc (enforced by a guard test). It produces a
 * consistent two-line toast:
 *   • title  — a localized category (the `titleKey`, e.g. "error.task.create"),
 *              so the headline matches the app language.
 *   • detail — the backend's complete, specific English reason (kept English by
 *              product decision: maximize diagnostic signal over translation).
 *
 * Passing the raw caught value is fine — anything that isn't an {@link ApiError}
 * still yields a useful detail via its `message`.
 */
export function presentError(err: unknown, titleKey = "error.unknown"): void {
  toast.error(t(titleKey), detailOf(err));
}

/** Extract the most specific human-readable detail from a thrown value. */
export function detailOf(err: unknown): string {
  if (err instanceof ApiError) {
    // A complete message already names the field(s) for validation failures.
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Map an ApiError's per-field validation detail to `{ fieldPath: message }` for
 * rendering inline messages under the offending inputs. Returns `{}` when the
 * error carries no field detail, so callers can use it unconditionally.
 */
export function fieldErrorsOf(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.fields) return {};
  const out: Record<string, string> = {};
  for (const f of err.fields as FieldError[]) {
    // Keep the first message per field — that's the primary reason to show.
    if (!(f.path in out)) out[f.path] = f.message;
  }
  return out;
}

/**
 * Like {@link fieldErrorsOf}, but restricted to the field paths a form actually
 * renders. This is what a submit handler should branch on: a validation error
 * for a path the form does NOT show (e.g. a stale backend still validating a
 * removed `email` field) must fall through to a toast, never be silently
 * swallowed into unrendered state — otherwise the submit looks like a no-op.
 */
export function fieldErrorsFor(err: unknown, fields: readonly string[]): Record<string, string> {
  const all = fieldErrorsOf(err);
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (all[f]) out[f] = all[f];
  }
  return out;
}
