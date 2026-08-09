/**
 * GitHub OAuth (Authorization Code, confidential client) — web-only login (#15).
 *
 * The server drives the whole exchange so the GitHub `client_secret` NEVER
 * reaches the browser. All outbound requests target FIXED GitHub hosts (declared
 * as constants below) — there is no user-supplied URL anywhere, so the flow is
 * SSRF-safe by construction. The GitHub access token is used transiently to read
 * the profile and then discarded; only the stable `github_user_id` is persisted.
 *
 * Feature-gated: the endpoints activate ONLY when both `LUMO_GITHUB_CLIENT_ID`
 * and `LUMO_GITHUB_CLIENT_SECRET` are set. When unset the login is disabled
 * (graceful degradation) and the frontend hides the button. Secrets are read
 * from the environment on demand and are never logged.
 *
 * The exported {@link githubOauth} object is a single seam: routes call through
 * it, and tests replace `exchangeCode` / `fetchGithubUser` on the object so no
 * real network call is ever made in the suite.
 */

// Fixed GitHub endpoints — the ONLY hosts this module ever contacts.
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

/** Minimal shape we read from `GET https://api.github.com/user`. */
export interface GithubUser {
  /** GitHub's stable numeric account id (persisted as text). */
  id: string;
  /** The GitHub handle — the seed for the derived Lumo username. */
  login: string;
}

function clientId(): string | undefined {
  const v = process.env.LUMO_GITHUB_CLIENT_ID?.trim();
  return v || undefined;
}

function clientSecret(): string | undefined {
  const v = process.env.LUMO_GITHUB_CLIENT_SECRET?.trim();
  return v || undefined;
}

/** The OAuth callback the GitHub app is configured to redirect back to. */
function callbackUrl(): string | undefined {
  const v = process.env.LUMO_GITHUB_CALLBACK_URL?.trim();
  return v || undefined;
}

/** GitHub login is available only when BOTH env credentials are provisioned. */
function isConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

/**
 * Build the GitHub authorize URL to 302 the user to. `state` is the single-use
 * CSRF token the caller minted; scope is the minimal `read:user` (no email —
 * GitHub email is never auto-trusted, per #15).
 */
function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId() ?? "",
    scope: "read:user",
    state,
    allow_signup: "true",
  });
  const cb = callbackUrl();
  if (cb) params.set("redirect_uri", cb);
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization `code` for a GitHub access token (server-to-server).
 * The `client_secret` is read from the env here and never logged. Throws on any
 * non-2xx / error response so the caller can map it to OAUTH_EXCHANGE_FAILED.
 */
async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      ...(callbackUrl() ? { redirect_uri: callbackUrl() } : {}),
    }),
  });
  if (!res.ok) throw new Error(`GitHub token exchange failed (${res.status})`);
  const data = (await res.json().catch(() => null)) as
    | { access_token?: string; error?: string }
    | null;
  // GitHub returns 200 with an `error` field on a bad/expired code.
  if (!data || data.error || !data.access_token) {
    throw new Error(`GitHub token exchange rejected (${data?.error ?? "no token"})`);
  }
  return data.access_token;
}

/** Fetch the authenticated GitHub user with a bearer access token. */
async function fetchGithubUser(accessToken: string): Promise<GithubUser> {
  const res = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "lumo-task",
    },
  });
  if (!res.ok) throw new Error(`GitHub user fetch failed (${res.status})`);
  const data = (await res.json().catch(() => null)) as { id?: number; login?: string } | null;
  if (!data || data.id == null || !data.login) {
    throw new Error("GitHub user response missing id/login");
  }
  return { id: String(data.id), login: data.login };
}

export const githubOauth = {
  isConfigured,
  buildAuthorizeUrl,
  exchangeCode,
  fetchGithubUser,
};
