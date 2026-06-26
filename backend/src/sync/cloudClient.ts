/**
 * Cloud sync client (ADR-0004 Addendum, 2026-06-26; P1b-core FR2).
 *
 * The desktop's LOCAL backend acts as a sync client against the cloud backend's
 * authenticated HTTP sync API (`POST {base}/v1/auth/signin`, `/v1/sync/pull`,
 * `/v1/sync/push`). It never touches the cloud DB directly and never holds Turso
 * credentials — the only secret on the device is the cloud JWT, stored encrypted.
 *
 * `CloudClient` is an INJECTABLE interface so the sync cycle is unit-testable
 * with an in-memory fake (the real cloud engine is already covered by P1a). The
 * production `httpCloudClient` is a thin fetch wrapper with a timeout and typed
 * errors.
 *
 * SSRF note: the base URL is a TRUSTED CONFIG CONSTANT (our operated cloud),
 * injected by Electron as `LUMO_CLOUD_API_BASE` — it is NOT a user-DB value, so
 * there is no SSRF concern here. We still restrict it to http(s) as a basic
 * sanity guard so a misconfig can't make us speak `file:`/`gopher:` etc.
 */
import type { SyncRow } from "@lumo/contracts";

export interface CloudClient {
  /** Sign into the cloud account; returns the JWT + cloud user id. */
  signin(email: string, password: string): Promise<{ token: string; userId: string }>;
  /** Pull the cloud user's rows changed since the HLC cursor. */
  pull(token: string, since: string): Promise<{ entities: Record<string, SyncRow[]>; cursor: string }>;
  /** Push local rows to the cloud (LWW; cloud forces its own user_id). */
  push(token: string, entities: Record<string, SyncRow[]>): Promise<{ applied: number; cursor: string }>;
}

/** Typed error for any non-2xx HTTP response or network/timeout failure. */
export class CloudError extends Error {
  /** HTTP status when there was a response; 0 for a network/timeout failure. */
  readonly status: number;
  /** Server error code when the body carried one. */
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "CloudError";
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** Reject anything that isn't a plain http(s) URL (basic config sanity guard). */
function assertHttpUrl(base: string): void {
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new CloudError(`Invalid cloud base URL: ${base}`, 0, "INVALID_CLOUD_BASE");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new CloudError(`Cloud base URL must be http(s): ${base}`, 0, "INVALID_CLOUD_BASE");
  }
}

/**
 * Real HTTP implementation. `baseUrl` is the cloud root (e.g.
 * `https://cloud.lumo.app`); endpoints are appended as `/v1/...`.
 */
export function httpCloudClient(
  baseUrl: string,
  opts: { timeoutMs?: number } = {},
): CloudClient {
  assertHttpUrl(baseUrl);
  const base = baseUrl.replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call<T>(path: string, body: unknown, token?: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      // AbortError (timeout) or any network failure → typed CloudError(status 0).
      const reason = err instanceof Error ? err.message : String(err);
      throw new CloudError(`Cloud request to ${path} failed: ${reason}`, 0, "NETWORK");
    } finally {
      clearTimeout(timer);
    }

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      parsed = undefined;
    }

    if (!res.ok) {
      const code = (parsed as { error?: { code?: string } })?.error?.code;
      throw new CloudError(
        `Cloud request to ${path} returned ${res.status}`,
        res.status,
        code,
      );
    }
    return parsed as T;
  }

  return {
    async signin(email, password) {
      const r = await call<{ token: string; user: { id: string } }>(
        "/v1/auth/signin",
        { email, password },
      );
      if (!r?.token || !r?.user?.id) {
        throw new CloudError("Cloud signin response missing token/user", 0, "BAD_RESPONSE");
      }
      return { token: r.token, userId: r.user.id };
    },
    async pull(token, since) {
      return call("/v1/sync/pull", { since }, token);
    },
    async push(token, entities) {
      return call("/v1/sync/push", { entities }, token);
    },
  };
}
