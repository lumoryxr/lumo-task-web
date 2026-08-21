/**
 * Live deployment targets for the production validation suite.
 *
 * Two environments run the SAME suite:
 *   - `production` — the VPS behind task.lumoryxr.com. Everything we
 *     advertise (share-card QR codes, README badges, launch posts) points
 *     here, so this is the one that must never be broken.
 *   - `gamma` — the Render deployment, used to validate a release before it
 *     reaches production.
 *
 * The URLs live in `environments.json` rather than here so the GitHub workflow
 * can build its matrix from the same file (`jq`), instead of restating hosts in
 * YAML where they quietly rot. A standards test asserts the two stay in sync
 * and that `production.baseUrl` is the URL we actually publish.
 *
 * Note the production topology: one Node process serves both the SPA and the
 * `/v1` API on a single origin (see docs/ops/vps-deployment.md), so `baseUrl`
 * and `apiBase` are equal there. On Render they are two separate services.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export interface E2EEnvironment {
  label: string;
  baseUrl: string;
  apiBase: string;
}

// Read rather than `import ... with { type: "json" }`: the same file is parsed
// by `jq` in CI and by the standards test, and a plain read behaves identically
// under Playwright's ESM loader, vitest and plain Node.
const here = dirname(fileURLToPath(import.meta.url));

export const ENVIRONMENTS = JSON.parse(
  readFileSync(resolve(here, "environments.json"), "utf8"),
) as Record<string, E2EEnvironment>;

/** Default target when nothing is passed: real production. */
export const DEFAULT_ENV = ENVIRONMENTS.production;

/** Frontend origin under test (`PROD_BASE_URL` overrides, e.g. from CI). */
export const TARGET_BASE_URL = process.env.PROD_BASE_URL ?? DEFAULT_ENV.baseUrl;

/** API origin under test (`PROD_API_BASE` overrides, e.g. from CI). */
export const TARGET_API_BASE = process.env.PROD_API_BASE ?? DEFAULT_ENV.apiBase;

/**
 * True when the SPA and the API answer on the same origin (the VPS shape).
 * A browser never issues a CORS preflight in that case, so CORS assertions
 * have to differ between the two topologies — see AC-12.3.
 */
export const IS_SAME_ORIGIN = new URL(TARGET_BASE_URL).origin === new URL(TARGET_API_BASE).origin;
