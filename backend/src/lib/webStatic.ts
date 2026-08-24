/**
 * Single-process web hosting (issue: local/LAN web package).
 *
 * When LUMO_WEB_ROOT is set, the backend also SERVES the built SPA from that
 * directory on the same port as the API — so a self-contained Windows/LAN
 * package is one process on one port (no separate static server, no CORS: the
 * SPA is same-origin with `/v1`). When the env var is unset (cloud/Render, and
 * all tests), nothing here runs and the process stays a pure API — preserving
 * the existing hosted deployment exactly.
 *
 * @hono/node-server's serveStatic resolves `root` relative to process.cwd()
 * (absolute paths are unsupported), so the launcher starts the process with cwd
 * at the package root and points LUMO_WEB_ROOT at a relative `web` dir.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

// Reserved server prefixes that must keep their API/JSON behavior and never be
// shadowed by the SPA fallback (an unknown /v1 path is a 404 JSON, not the app).
// ALSO reserved: static assets (never fall back to index.html — a missing chunk
// is a real 404, not a client route).
function isReservedApiPath(path: string): boolean {
  return (
    path === "/health" ||
    path === "/ready" ||
    path === "/v1" ||
    path.startsWith("/v1/") ||
    path === "/docs" ||
    path.startsWith("/docs/") ||
    path.startsWith("/assets/")  // Static assets: 404, never SPA fallback
  );
}

/**
 * Mount static SPA hosting on an existing app. Serves real files from `webRoot`
 * (relative to cwd) and falls back to index.html for client-side routes, while
 * leaving API paths to their existing JSON 404s.
 *
 * Must be called AFTER the API routes are registered so the `/*` static
 * middleware never wraps (and thus never shadows) them.
 */
export function mountWebStatic(app: Hono<any>, webRoot: string): void {
  // Fail fast at boot if the web root is missing its entry point — a broken
  // package should not start and silently serve 404s for the app shell.
  const indexHtml = readFileSync(join(process.cwd(), webRoot, "index.html"), "utf8");

  // Serve real static assets (hashed JS/CSS, icons, manifest). Unmatched files
  // fall through to the SPA fallback below.
  app.use("/*", serveStatic({ root: webRoot }));

  // SPA fallback: any unmatched GET that is not a reserved API path returns the
  // app shell so client-side routes (e.g. /matrix) survive a hard refresh.
  // Reserved API paths and non-GET methods keep the standard JSON 404.
  app.notFound((c) => {
    if (c.req.method === "GET" && !isReservedApiPath(c.req.path)) {
      return c.html(indexHtml);
    }
    return c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
  });
}
