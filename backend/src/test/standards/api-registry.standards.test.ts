/**
 * Standards · API registry ≡ runtime router
 *
 * The executable form of the "API-First, design matches runtime" rule.
 *
 * `@lumo/contracts` declares the API surface in `src/registry.ts`, and the
 * OpenAPI document published at `GET /docs/openapi.json` is generated from it.
 * That is only worth anything if the registry describes the endpoints the server
 * ACTUALLY mounts — otherwise it is just a third hand-written spec, which is
 * exactly the failure mode this replaces (the previous hand-written spec in
 * routes/docs.ts covered 22 of 76 live endpoints, and nothing noticed).
 *
 * So this test diffs the registry against `app.routes` — Hono's own record of
 * what it will serve — and fails in BOTH directions:
 *
 *   • a route mounted with no registry entry  → undocumented endpoint;
 *   • a registry entry with no mounted route  → the spec promises a 404.
 *
 * When it fails, the fix is never to loosen the test. Either add the missing
 * registry entry (schema first) or delete the stale one.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { API_ROUTES, routeKey, buildOpenApiDocument, toOpenApiPath } from "@lumo/contracts";
import { app } from "../../app.js";

/**
 * Every `METHOD /path` the Hono app will serve.
 *
 * `app.routes` has one entry per registered handler, so a path with middleware
 * appears several times and middleware itself registers as method `ALL` — both
 * are collapsed away here, leaving only the endpoints a client can call.
 */
function mountedRouteKeys(): Set<string> {
  return new Set(
    app.routes
      .filter((r) => r.method !== "ALL")
      .map((r) => routeKey(r.method, r.path)),
  );
}

describe("Standards · API registry matches the mounted router", () => {
  test("every mounted route is declared in the registry", () => {
    const declared = new Set(API_ROUTES.map((r) => routeKey(r.method, r.path)));
    const undocumented = [...mountedRouteKeys()].filter((k) => !declared.has(k)).sort();

    assert.deepEqual(
      undocumented,
      [],
      `These routes are mounted but missing from @lumo/contracts' API_ROUTES, so they are ` +
        `absent from the published OpenAPI document. Add an entry (schema first) in ` +
        `packages/contracts/src/registry.ts:\n  ${undocumented.join("\n  ")}`,
    );
  });

  test("every registry entry is actually mounted", () => {
    const mounted = mountedRouteKeys();
    const phantom = API_ROUTES.map((r) => routeKey(r.method, r.path))
      .filter((k) => !mounted.has(k))
      .sort();

    assert.deepEqual(
      phantom,
      [],
      `These routes are declared in @lumo/contracts' API_ROUTES but are not mounted by the ` +
        `app, so the published docs promise endpoints that return 404. Remove the stale ` +
        `entry or mount the route:\n  ${phantom.join("\n  ")}`,
    );
  });

  test("the registry declares no duplicate method+path", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const route of API_ROUTES) {
      const key = routeKey(route.method, route.path);
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    assert.deepEqual(duplicates, [], `Duplicate registry entries: ${duplicates.join(", ")}`);
  });
});

describe("Standards · generated OpenAPI document", () => {
  const doc = buildOpenApiDocument() as {
    paths: Record<string, Record<string, { responses: Record<string, unknown>; summary?: string }>>;
    components: { schemas: Record<string, unknown> };
  };

  test("contains an operation for every registry entry", () => {
    for (const route of API_ROUTES) {
      const path = toOpenApiPath(route.path);
      assert.ok(doc.paths[path], `OpenAPI document has no path entry for ${path}`);
      assert.ok(
        doc.paths[path][route.method],
        `OpenAPI document has no ${route.method.toUpperCase()} operation for ${path}`,
      );
    }
  });

  test("every operation documents a summary and at least one response", () => {
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        assert.ok(op.summary, `${method.toUpperCase()} ${path} has no summary`);
        assert.ok(
          Object.keys(op.responses ?? {}).length > 0,
          `${method.toUpperCase()} ${path} documents no responses`,
        );
      }
    }
  });

  test("every authenticated operation documents a 401", () => {
    for (const route of API_ROUTES) {
      if (route.auth === "public" || route.auth === "feed-token") continue;
      const op = doc.paths[toOpenApiPath(route.path)][route.method];
      assert.ok(
        op.responses["401"],
        `${route.method.toUpperCase()} ${route.path} requires auth but documents no 401`,
      );
    }
  });

  test("every $ref resolves to a declared component schema", () => {
    const declared = new Set(Object.keys(doc.components.schemas));
    const refs = [...JSON.stringify(doc).matchAll(/#\/components\/schemas\/([A-Za-z0-9_]+)/g)].map(
      (m) => m[1],
    );
    const dangling = [...new Set(refs)].filter((name) => !declared.has(name)).sort();
    assert.deepEqual(dangling, [], `Dangling $ref(s): ${dangling.join(", ")}`);
  });

  test("no operation leaks a secret-shaped field into a response schema", () => {
    // The AI key / password hash / feed token must never appear in a response
    // shape. A leak here is a contract-level bug, catchable before any handler
    // is written — CLAUDE.md: "API keys are NEVER returned from any endpoint".
    const FORBIDDEN = ["password_hash", "ai_api_key", "apiKey", "api_key", "refresh_token_hash"];
    const serialized = JSON.stringify(doc);
    for (const field of FORBIDDEN) {
      assert.equal(
        serialized.includes(`"${field}"`),
        false,
        `The generated OpenAPI document exposes a secret-shaped field "${field}"`,
      );
    }
  });
});
