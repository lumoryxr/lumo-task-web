/**
 * Standards · Contract-First enforcement (static scan)
 *
 * Turns the CLAUDE.md "Contract-First" rule into an executable guard: a route
 * must NOT define its request-body shape inline — it must import the schema from
 * `@lumo/contracts`. We forbid the specific anti-pattern of passing an inline
 * object literal as the JSON body validator: `validate("json", z.object({…}))`.
 *
 * This scan is **deny-by-default across every route file**. It used to run
 * against a two-file allow-list (`tasks.ts`, `people.ts`), which meant the other
 * sixteen route files could — and did — define API shapes inline without the
 * gate noticing. Every domain has since been migrated, so the allow-list is
 * gone; there is nothing left to exempt and no way to add a route that quietly
 * opts out.
 *
 * Path-param coercion (`validate("param", z.object({ id: … }))`) stays allowed:
 * it narrows a URL segment, it is not an API request/response shape.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const routesDir = resolve(here, "../../routes");
const routeFiles = readdirSync(routesDir).filter((f) => f.endsWith(".ts"));

/**
 * Inline object schema used as a JSON body validator — the forbidden pattern.
 * Routes call the project `validate(...)` wrapper; older code used `zValidator`
 * directly, so match either to stay robust against an accidental regression.
 */
const INLINE_JSON_BODY = /(?:validate|zValidator)\(\s*["']json["']\s*,\s*z\.object\s*\(/;

/** Does the file validate a JSON body at all? Files that don't need no import. */
const HAS_JSON_BODY = /(?:validate|zValidator)\(\s*["']json["']/;

describe("Standards · Contract-First (every route sources its shapes from @lumo/contracts)", () => {
  for (const file of routeFiles) {
    const src = readFileSync(resolve(routesDir, file), "utf8");

    test(`${file} does not define an inline JSON body schema`, () => {
      assert.equal(
        INLINE_JSON_BODY.test(src),
        false,
        `${file} passes an inline z.object() as a JSON body validator — move the shape into ` +
          `@lumo/contracts and import it. (Path params via validate("param", …) are exempt.)`,
      );
    });

    if (HAS_JSON_BODY.test(src)) {
      test(`${file} imports its request schema from @lumo/contracts`, () => {
        assert.ok(
          /from\s+["']@lumo\/contracts["']/.test(src),
          `${file} validates a JSON body but imports nothing from @lumo/contracts — its ` +
            `request shape must come from the contract package`,
        );
      });
    }
  }
});

/**
 * Standards · Unified validation — no route may import `@hono/zod-validator`
 * directly. The `validate(...)` wrapper (src/lib/validate.ts) is the only place
 * allowed to, because it is what normalizes a validation failure into the
 * canonical `{ error: { code: "VALIDATION_ERROR", message, fields } }` envelope.
 * A direct import would let a request bypass that and leak the library's raw
 * `{ success: false, error }` shape, which the frontend cannot read.
 */
describe("Standards · Unified validation (routes use the validate() wrapper)", () => {
  for (const file of routeFiles) {
    test(`${file} does not import @hono/zod-validator directly`, () => {
      const src = readFileSync(resolve(routesDir, file), "utf8");
      assert.equal(
        /from\s+["']@hono\/zod-validator["']/.test(src),
        false,
        `${file} imports @hono/zod-validator directly — use the validate() wrapper from ../lib/validate instead`,
      );
    });
  }
});

/**
 * Standards · No hand-written OpenAPI. The document is generated from the route
 * registry; `routes/docs.ts` must contain no path list or schema of its own.
 * A regression here is how the spec silently fell 54 endpoints behind before.
 */
describe("Standards · OpenAPI is generated, never hand-written", () => {
  const docsSrc = readFileSync(resolve(routesDir, "docs.ts"), "utf8");

  test("routes/docs.ts declares no paths of its own", () => {
    assert.equal(
      /["']\/v1\/[A-Za-z0-9/{}:_-]*["']\s*:/.test(docsSrc),
      false,
      "routes/docs.ts hand-declares an API path — the OpenAPI document must be generated " +
        "from API_ROUTES in @lumo/contracts instead",
    );
  });

  test("routes/docs.ts builds the document from the contract package", () => {
    assert.ok(
      /buildOpenApiDocument/.test(docsSrc) && /@lumo\/contracts/.test(docsSrc),
      "routes/docs.ts must serve buildOpenApiDocument() from @lumo/contracts",
    );
  });
});
