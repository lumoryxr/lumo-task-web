import { z } from "zod";
import { UserProfileWireSchema } from "./user.js";

/**
 * Auth contract — single source of truth for the `/v1/auth/*` protocol.
 *
 * Contract-First: these shapes were previously defined inline in
 * `backend/src/routes/auth.ts`, which meant the credential rules (password
 * strength, username grammar, reserved names) lived in one file and were
 * invisible to the frontend and to the generated OpenAPI document. They now
 * live here, so the route validates with the same schema the docs publish and
 * the client infers its types from.
 *
 * Note on `strongPassword` / `usernameField`: the refinement *messages* are part
 * of the contract — `validate()` surfaces them per-field to the UI, so changing
 * them changes what a user sees.
 */

// ── Credential primitives ─────────────────────────────────────────────────────

/** Usernames the platform reserves for its own use — never claimable. */
export const RESERVED_USERNAMES = new Set(["admin", "root", "lumo", "support", "system"]);

/** Reject weak passwords everywhere a new password is set (register / reset / change). */
export const StrongPasswordSchema = z
  .string()
  .min(8)
  .max(256)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), {
    message: "Password must include at least one letter and one number",
  });

/**
 * Username rules: 3–32 chars from [A-Za-z0-9_-], not starting/ending with a
 * separator, and not a reserved word. All violations surface as
 * VALIDATION_ERROR with a per-field message the frontend renders inline.
 */
export const UsernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(/^[A-Za-z0-9_-]+$/, "Username may only use letters, numbers, hyphens and underscores")
  .refine((u) => !/^[-_]/.test(u) && !/[-_]$/.test(u), {
    message: "Username can't start or end with a hyphen or underscore",
  })
  .refine((u) => !RESERVED_USERNAMES.has(u.toLowerCase()), {
    message: "That username is reserved",
  });

/** Opaque, single-use token delivered by email (verify / reset) or held by the client (refresh). */
const OpaqueTokenSchema = z.string().min(1).max(512);

// ── Request bodies ────────────────────────────────────────────────────────────

export const RegisterBodySchema = z.object({
  username: UsernameSchema,
  password: StrongPasswordSchema,
});

/**
 * Sign-in deliberately does NOT apply `UsernameSchema` / `StrongPasswordSchema`:
 * an existing account created under older rules must still be able to sign in,
 * and a strength check on the *submitted* password would leak which passwords
 * could possibly be valid. Only length bounds apply.
 */
export const SigninBodySchema = z.object({
  username: z.string().min(1).max(32),
  password: z.string(),
});

export const BindEmailBodySchema = z.object({
  email: z.string().email().max(255),
});

export const RecoveryResetBodySchema = z.object({
  username: z.string().min(1).max(32),
  code: z.string().min(1).max(64),
  new_password: StrongPasswordSchema,
});

export const ChangePasswordBodySchema = z.object({
  current_password: z.string().max(256),
  new_password: StrongPasswordSchema,
});

export const RefreshBodySchema = z.object({
  refreshToken: OpaqueTokenSchema,
});

export const ForgotPasswordBodySchema = z.object({
  email: z.string().email().max(255),
});

export const ResetPasswordBodySchema = z.object({
  token: OpaqueTokenSchema,
  new_password: StrongPasswordSchema,
});

export const VerifyEmailBodySchema = z.object({
  token: OpaqueTokenSchema,
});

/**
 * POST /v1/auth/github/exchange — the SPA trades the one-time handoff code the
 * OAuth callback redirected it with for a real Lumo session. Single-use.
 */
export const GithubExchangeBodySchema = z.object({
  code: z.string().min(1).max(128),
});

// ── Wire responses ────────────────────────────────────────────────────────────

/**
 * The session envelope returned by register / signin. `recoveryCode` is the
 * one-time offline reset fallback: its plaintext is returned EXACTLY once, at
 * registration (and on explicit regeneration), and is never stored in the clear
 * nor logged — so it is absent from the signin response.
 */
export const AuthSessionWireSchema = z.object({
  token: z.string(),
  refreshToken: z.string(),
  recoveryCode: z.string().optional(),
  user: UserProfileWireSchema,
});

/** POST /v1/auth/refresh — rotates the refresh token (single-use). */
export const RefreshResponseSchema = z.object({
  token: z.string(),
  refreshToken: z.string(),
});

/** POST /v1/auth/recovery-code/regenerate — returns a fresh one-time code. */
export const RecoveryCodeResponseSchema = z.object({
  recoveryCode: z.string(),
});

/** POST /v1/auth/bind-email — the address is stored UNVERIFIED and a link is sent. */
export const BindEmailResponseSchema = z.object({
  ok: z.literal(true),
  email: z.string(),
  emailVerified: z.literal(false),
});

/**
 * The generic acknowledgement shared by signout / change-password /
 * forgot-password / reset-password / verify-email / resend-verification.
 *
 * `forgot-password` intentionally returns this same `{ ok: true }` whether or
 * not the address exists — a distinguishable response would turn the endpoint
 * into an account-enumeration oracle.
 */
export const AuthOkResponseSchema = z.object({
  ok: z.literal(true),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type RegisterInput = z.input<typeof RegisterBodySchema>;
export type SigninInput = z.input<typeof SigninBodySchema>;
export type BindEmailInput = z.input<typeof BindEmailBodySchema>;
export type RecoveryResetInput = z.input<typeof RecoveryResetBodySchema>;
export type ChangePasswordInput = z.input<typeof ChangePasswordBodySchema>;
export type RefreshInput = z.input<typeof RefreshBodySchema>;
export type ForgotPasswordInput = z.input<typeof ForgotPasswordBodySchema>;
export type ResetPasswordInput = z.input<typeof ResetPasswordBodySchema>;
export type VerifyEmailInput = z.input<typeof VerifyEmailBodySchema>;
export type GithubExchangeInput = z.input<typeof GithubExchangeBodySchema>;

export type AuthSessionWire = z.infer<typeof AuthSessionWireSchema>;
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;
export type RecoveryCodeResponse = z.infer<typeof RecoveryCodeResponseSchema>;
export type BindEmailResponse = z.infer<typeof BindEmailResponseSchema>;
export type AuthOkResponse = z.infer<typeof AuthOkResponseSchema>;
