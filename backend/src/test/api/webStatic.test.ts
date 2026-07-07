/**
 * API · Single-process SPA hosting (mountWebStatic)
 *
 * Verifies the local/LAN web package can serve the built SPA and the API from
 * one origin: real static files are served, client routes fall back to the app
 * shell, and reserved API paths keep their JSON 404s (never masked by the SPA).
 *
 * Uses a fresh Hono app (not the global one) because mountWebStatic installs a
 * global notFound handler; a throwaway app keeps that out of the other suites.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { mountWebStatic } from "../../lib/webStatic.js";

// serveStatic resolves `root` relative to process.cwd() (the backend dir when
// `npm test` runs), so point it at the committed fixture web root.
const WEB_ROOT = "src/test/fixtures/webroot";

function makeApp(): Hono {
  const app = new Hono();
  // Stand in for the real API + liveness routes registered before hosting.
  app.get("/v1/ping", (c) => c.json({ ok: true }));
  app.get("/health", (c) => c.json({ ok: true }));
  mountWebStatic(app as unknown as Hono<any>, WEB_ROOT);
  return app;
}

describe("Web static hosting", () => {
  const app = makeApp();

  test("serves index.html at /", async () => {
    const res = await app.request("/");
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /SPA_SHELL_MARKER/);
  });

  test("serves real static assets", async () => {
    const res = await app.request("/assets/app.js");
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /LUMO_APP_BUNDLE_MARKER/);
  });

  test("client-side routes fall back to the app shell (SPA)", async () => {
    const res = await app.request("/matrix");
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /SPA_SHELL_MARKER/, "unknown GET route returns index.html");
  });

  test("does NOT shadow real API routes", async () => {
    const res = await app.request("/v1/ping");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test("unknown /v1 path keeps JSON 404 (not the SPA shell)", async () => {
    const res = await app.request("/v1/does-not-exist");
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error?: { code?: string } };
    assert.equal(body.error?.code, "NOT_FOUND");
  });

  test("reserved liveness path is untouched", async () => {
    const res = await app.request("/health");
    assert.equal(res.status, 200);
  });

  test("non-GET unmatched request is a JSON 404, never the SPA shell", async () => {
    const res = await app.request("/some/path", { method: "POST" });
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error?: { code?: string } };
    assert.equal(body.error?.code, "NOT_FOUND");
  });
});
