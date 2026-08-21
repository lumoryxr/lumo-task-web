/**
 * Standards · live-site validation targets
 *
 * The production E2E suite (`e2e/production.spec.ts`) runs against real
 * deployments, and there are two of them:
 *
 *   - **production** — the VPS behind `task.lumoryxr.com`. This is the URL
 *     every share card, QR code, README badge and launch post points at.
 *   - **gamma** — the Render deployment, used to validate a release before it
 *     reaches production.
 *
 * Their URLs live in ONE place (`e2e/environments.json`) so the Playwright
 * config, the spec and the GitHub workflow matrix cannot drift apart. This
 * guard keeps that true, and — most importantly — keeps the environment we
 * validate as "production" identical to the one we advertise (`SITE_URL`).
 * A silent drift there means we ship marketing traffic to an unvalidated host.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { SITE_URL } from "@/config/app";

const here = dirname(fileURLToPath(import.meta.url));
const webAppRoot = resolve(here, "../../..");
const repoRoot = resolve(webAppRoot, "..");

const envs = JSON.parse(
  readFileSync(resolve(webAppRoot, "e2e/environments.json"), "utf8"),
) as Record<string, { label: string; baseUrl: string; apiBase: string }>;

const workflow = readFileSync(
  resolve(repoRoot, ".github/workflows/prod-site-validation.yml"),
  "utf8",
);

describe("Standards · live-site validation targets", () => {
  it("defines both the production and the gamma environment", () => {
    expect(Object.keys(envs).sort()).toEqual(["gamma", "production"]);
  });

  it("gives every environment an https frontend and API base", () => {
    for (const [name, env] of Object.entries(envs)) {
      expect(env.label, `${name}.label`).toBeTruthy();
      expect(env.baseUrl, `${name}.baseUrl`).toMatch(/^https:\/\/[^/]+$/);
      expect(env.apiBase, `${name}.apiBase`).toMatch(/^https:\/\/[^/]+$/);
    }
  });

  it("validates the exact host we advertise as production", () => {
    // SITE_URL is what share cards, QR codes and every launch post point at.
    expect(envs.production.baseUrl).toBe(SITE_URL);
  });

  it("keeps gamma pointed somewhere other than production", () => {
    expect(envs.gamma.baseUrl).not.toBe(envs.production.baseUrl);
  });

  it("drives the workflow matrix from the shared file, not hardcoded hosts", () => {
    expect(workflow).toContain("e2e/environments.json");
    // A host may appear in a `#` comment (documenting what an environment is),
    // but must never be baked into an executable line — those come from the
    // JSON via the matrix. Strip comment lines, then assert no host survives.
    const executable = workflow
      .split("\n")
      .filter((line) => !/^\s*#/.test(line))
      .join("\n");
    for (const env of Object.values(envs)) {
      const host = new URL(env.baseUrl).host;
      expect(executable, `workflow hardcodes ${host} outside a comment`).not.toContain(host);
    }
  });
});
