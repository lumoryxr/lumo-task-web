import type { FieldError } from "@lumo/contracts";

/**
 * The single error type thrown by the API client for any non-2xx response.
 *
 * It carries the backend's canonical envelope — `code`, the full English
 * `message` (a complete, specific reason, never a bare "HTTP 400"), the HTTP
 * `status`, and optional per-field `fields` for inline form display. Callers
 * should route every API failure through `presentError()` (toast) or read
 * `fields` for inline messages, rather than re-deriving strings ad hoc.
 */
export class ApiError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly fields?: FieldError[];

  constructor(message: string, opts: { code?: string; status?: number; fields?: FieldError[] } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = opts.code;
    this.status = opts.status;
    this.fields = opts.fields;
  }
}

/** Narrow an unknown thrown value to ApiError. */
export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
