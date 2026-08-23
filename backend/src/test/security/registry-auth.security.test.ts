/**
 * Security · The registry's declared auth mode matches what the router enforces.
 *
 * `API_ROUTES` states an `auth` mode per endpoint — `public`, `bearer`, `admin`,
 * or `feed-token` — and that value is what the generated OpenAPI document
 * publishes as the endpoint's security requirement. But it is an *assertion*
 * written by hand, not something derived from the middleware chain, so the
 * registry↔router parity test (which compares method+path only) would happily
 * pass while an endpoint was documented as authenticated and served unprotected,
 * or vice versa.
 *
 * This closes that gap behaviourally rather than by static scan: every endpoint
 * is actually called with no `Authorization` header, and the response is checked
 * against what the registry claims. `authMiddleware` answers a missing header
 * with 401 before any handler runs, so:
 *
 *   • a `bearer` / `admin` route that does NOT 401 is unprotected — a real
 *     vulnerability, whichever side is wrong;
 *   • a `public` route that DOES 401 is documented as reachable but isn't.
 *
 * Because it drives the real router, it catches the case a static scan cannot:
 * a route whose middleware was reordered, or attached to the wrong sub-app.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { API_ROUTES, type RouteDef } from "@lumo/contracts";
import { app } from "../../app.js";

/** Fill path params with a syntactically valid value that owns nothing. */
function concretePath(honoPath: string): string {
  return honoPath
    .replace(/:date\b/g, "2026-01-01")
    .replace(/:[A-Za-z0-9_]+/g, "no-such-id");
}

/**
 * Call an endpoint with no credentials at all.
 *
 * A body is sent for methods that take one so the request is well-formed;
 * validation runs *after* auth, so it never changes the answer for a protected
 * route — and for a public route a 400 is still a perfectly good "not a 401".
 */
async function callAnonymously(route: RouteDef): Promise<Response> {
  const method = route.method.toUpperCase();
  const hasBody = method === "POST" || method === "PATCH" || method === "PUT";
  return app.request(concretePath(route.path), {
    method,
    ...(hasBody
      ? { headers: { "Content-Type": "application/json" }, body: "{}" }
      : {}),
  });
}

// `/metrics` is the one endpoint whose protection is conditional: with
// LUMO_METRICS_TOKEN unset it disables itself (404) rather than 401ing, so
// scraping is never public by accident. Set a token for this suite so the
// authenticated branch — the one the registry documents — is what gets tested.
const savedMetricsToken = process.env.LUMO_METRICS_TOKEN;
before(() => {
  process.env.LUMO_METRICS_TOKEN = "test-metrics-token";
});
after(() => {
  if (savedMetricsToken === undefined) delete process.env.LUMO_METRICS_TOKEN;
  else process.env.LUMO_METRICS_TOKEN = savedMetricsToken;
});

const protectedRoutes = API_ROUTES.filter((r) => r.auth === "bearer" || r.auth === "admin");
const publicRoutes = API_ROUTES.filter((r) => r.auth === "public");
const feedTokenRoutes = API_ROUTES.filter((r) => r.auth === "feed-token");

describe("Security · every route declared authenticated actually rejects anonymous callers", () => {
  // Sanity: if this ever drops to zero the suite is silently testing nothing.
  test("the registry declares a meaningful number of protected routes", () => {
    assert.ok(
      protectedRoutes.length >= 50,
      `only ${protectedRoutes.length} protected routes found — the registry or this filter is wrong`,
    );
  });

  for (const route of protectedRoutes) {
    const label = `${route.method.toUpperCase()} ${route.path}`;
    test(`${label} (auth: ${route.auth}) answers 401 without a token`, async () => {
      const res = await callAnonymously(route);
      assert.equal(
        res.status,
        401,
        `${label} is declared auth:"${route.auth}" in API_ROUTES but returned ${res.status} to an ` +
          `anonymous request. Either the route is unprotected (a vulnerability) or the registry ` +
          `entry is wrong (the published docs mis-state its security).`,
      );
    });
  }
});

describe("Security · every route declared public is reachable without a token", () => {
  for (const route of publicRoutes) {
    const label = `${route.method.toUpperCase()} ${route.path}`;
    test(`${label} does not answer 401`, async () => {
      const res = await callAnonymously(route);
      assert.notEqual(
        res.status,
        401,
        `${label} is declared auth:"public" in API_ROUTES but returned 401 to an anonymous ` +
          `request — the published docs say it needs no credential, and it does.`,
      );
    });
  }
});

describe("Security · feed-token routes reject a caller with no token", () => {
  for (const route of feedTokenRoutes) {
    const label = `${route.method.toUpperCase()} ${route.path}`;
    test(`${label} refuses an untokened request`, async () => {
      // The iCal feed is reachable without an Authorization header by design —
      // calendar clients cannot send one — so its credential is the unguessable
      // token in the query string. Omitting it must still be refused, otherwise
      // the feed is world-readable.
      const res = await callAnonymously(route);
      assert.ok(
        res.status === 401 || res.status === 400 || res.status === 404,
        `${label} returned ${res.status} with no feed token — an untokened request must be ` +
          `refused, or every user's calendar is public`,
      );
    });
  }
});
