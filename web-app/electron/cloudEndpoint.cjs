// Cloud-sync backend endpoint resolution + validation.
//
// The desktop app's bundled backend runs an in-process sync client that signs
// into a cloud backend with the user's cloud credentials. Which cloud it talks
// to is configurable, because Lumo is self-hostable: a user running their own
// server needs to point the desktop app at it.
//
// SECURITY MODEL — this value is trusted, but only because of WHERE it comes
// from. It is read from local machine state the user themselves controls (the
// Electron prefs file, or an operator-set env var at package time) and injected
// into the backend via `LUMO_CLOUD_API_BASE`. It is NEVER accepted from an HTTP
// request body — the sync route rejects a request-supplied base precisely
// because on the shared cloud that would be an SSRF / credential-exfiltration
// vector. Letting the machine's owner choose their own server in Settings does
// not weaken that: they can only send their own credentials to their own
// server. `validateCloudEndpoint` keeps even that local value sane (https, or
// http for localhost only; origin-only; bounded length).

// Everything we advertise points here (share cards, QR codes, README, launch
// posts), so it is the right default for a fresh desktop install too.
const DEFAULT_CLOUD_API_BASE = "https://lumoryxr.duckdns.org";

const MAX_ENDPOINT_LENGTH = 200;

/**
 * Validate a user-entered cloud endpoint.
 *
 * Accepts an https origin, or an http origin only for loopback hosts (so a
 * self-hoster can test against a local server). Rejects anything with a path,
 * query, credentials, or non-loopback http. Returns the normalised origin
 * (no trailing slash) on success, or null when invalid.
 */
function validateCloudEndpoint(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_ENDPOINT_LENGTH) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]" ||
    url.hostname === "::1";

  if (url.protocol === "http:") {
    if (!isLoopback) return null; // plaintext only to your own machine
  } else if (url.protocol !== "https:") {
    return null;
  }

  // Reject embedded credentials and anything beyond a bare origin — the backend
  // appends `/v1` itself, so a path/query here is always a mistake.
  if (url.username || url.password) return null;
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) return null;

  return url.origin;
}

/**
 * Resolve the cloud endpoint the backend should use, in priority order:
 *   1. the user's saved custom endpoint (validated), if any
 *   2. an operator-set `LUMO_CLOUD_API_BASE` baked in at package time
 *   3. the built-in default (production)
 *
 * @param {{ savedEndpoint?: string|null, envBase?: string|null }} [opts]
 */
function resolveCloudApiBase(opts = {}) {
  const saved = validateCloudEndpoint(opts.savedEndpoint ?? "");
  if (saved) return saved;
  const env = validateCloudEndpoint(opts.envBase ?? "");
  if (env) return env;
  return DEFAULT_CLOUD_API_BASE;
}

module.exports = {
  DEFAULT_CLOUD_API_BASE,
  MAX_ENDPOINT_LENGTH,
  validateCloudEndpoint,
  resolveCloudApiBase,
};
