import { z } from "zod";

/**
 * Central registry of every API error code — the single source of truth.
 *
 * Codes were previously string literals scattered across ~66 route sites with
 * no enum, so typos were invisible and the set was undiscoverable. Every
 * `httpError(...)` call and `app.onError` now references a member of this map,
 * which gives compile-time safety on the backend and a shared vocabulary the
 * frontend can switch on.
 *
 * Each entry pairs the code with the HTTP status it conventionally rides on and
 * a short purpose note. The status is documentation only — the call site still
 * passes the status explicitly so context-specific overrides stay possible.
 */
export const ERROR_CODES = {
  // 400 — bad request / validation
  VALIDATION_ERROR: { status: 400, about: "Request body/params failed schema validation" },
  BAD_REQUEST: { status: 400, about: "Generic malformed request" },
  HTTP_ERROR: { status: 400, about: "Framework-level client error (non-400 4xx HTTPException)" },
  INVALID_JSON: { status: 400, about: "Request body was not valid JSON" },
  INVALID_CURSOR: { status: 400, about: "Pagination cursor could not be decoded" },
  INVALID_DATE: { status: 400, about: "Date query parameter was malformed" },
  INVALID_BASE_URL: { status: 400, about: "Provided URL failed the SSRF allow-list check" },
  INVALID_ROW: { status: 400, about: "A pushed sync row failed schema validation" },
  MISSING_PARAMS: { status: 400, about: "A required query parameter was absent" },
  WRONG_PASSWORD: { status: 400, about: "Supplied current password was incorrect" },
  INVALID_RECOVERY_CODE: { status: 400, about: "Recovery code is unknown, malformed, or already used" },
  INVALID_PROJECT: { status: 400, about: "Referenced project does not exist or is not owned by the caller" },
  NO_CLOUD_BASE: { status: 400, about: "Cloud API base URL is not configured" },
  // 401 — auth
  UNAUTHORIZED: { status: 401, about: "Missing, invalid, or revoked access token" },
  INVALID_CREDENTIALS: { status: 401, about: "Email not found or password mismatch" },
  INVALID_REFRESH_TOKEN: { status: 401, about: "Refresh token is unknown, expired, rotated, or revoked" },
  INVALID_RESET_TOKEN: { status: 400, about: "Password reset token is unknown, expired, or already used" },
  INVALID_VERIFICATION_TOKEN: { status: 400, about: "Email verification token is unknown, expired, or already used" },
  CLOUD_AUTH_FAILED: { status: 401, about: "Cloud sign-in was rejected" },
  // 404 — not found
  NOT_FOUND: { status: 404, about: "Requested resource does not exist" },
  // 413 — payload too large
  PAYLOAD_TOO_LARGE: { status: 413, about: "Request body exceeded the size limit" },
  // 400 — OAuth (GitHub, #15)
  OAUTH_STATE_INVALID: { status: 400, about: "OAuth callback `state` was unknown, expired, or already consumed (CSRF guard)" },
  // 409 — conflict
  EMAIL_TAKEN: { status: 409, about: "Email is already registered" },
  USERNAME_TAKEN: { status: 409, about: "Username is already registered" },
  NOT_ENABLED: { status: 409, about: "Operation requires a feature that is not enabled" },
  GITHUB_ALREADY_LINKED: { status: 409, about: "That GitHub identity is already bound to a different account" },
  // 500 — server
  INTERNAL_ERROR: { status: 500, about: "Unspecified server fault" },
  SYNC_FAILED: { status: 500, about: "A sync operation failed server-side" },
  // 502/503 — upstream
  AI_UNAVAILABLE: { status: 502, about: "AI provider unavailable or returned an unexpected result" },
  AI_PARSE_ERROR: { status: 502, about: "AI provider response could not be parsed" },
  CLOUD_UNREACHABLE: { status: 502, about: "Cloud request failed to reach the server" },
  OUTLOOK_FETCH_FAILED: { status: 502, about: "Outlook Graph API fetch failed" },
  OUTLOOK_NOT_CONFIGURED: { status: 503, about: "Outlook server credentials are not configured" },
  OAUTH_EXCHANGE_FAILED: { status: 502, about: "GitHub OAuth token exchange or user fetch failed upstream" },
  // 501 — not implemented / not configured
  OAUTH_NOT_CONFIGURED: { status: 501, about: "GitHub OAuth is not configured on this server (env credentials unset)" },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** All known error codes as a runtime array (for guards/tests). */
export const ERROR_CODE_LIST = Object.keys(ERROR_CODES) as ErrorCode[];

/**
 * Per-field validation detail. Present on `VALIDATION_ERROR` responses so the
 * frontend can render an inline message under the offending input instead of a
 * single opaque toast. `path` is the dotted field path (e.g. `"password"`).
 */
export const FieldErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof FieldErrorSchema>;

/**
 * API error envelope — the single source of truth for every error response.
 *
 * The backend's `httpError(c, status, code, message)` (src/lib/errors.ts), the
 * `validate(...)` wrapper (src/lib/validate.ts), and the global `app.onError`
 * all emit this shape. A standards test parses real error responses with it so
 * the envelope can never drift, and the frontend infers its `ApiError` type
 * from it instead of hand-writing one.
 *
 * `message` is always a complete, specific, human-readable reason (English) —
 * never a bare status. For validation failures it names the field(s) and why,
 * and `fields` carries the same detail in a structured, per-input form.
 */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.array(FieldErrorSchema).optional(),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
