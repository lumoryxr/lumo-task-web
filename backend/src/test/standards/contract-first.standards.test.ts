/**
 * Standards · Contract-First enforcement (static scan)
 *
 * Turns the CLAUDE.md "Contract-First" rule into an executable guard. For every
 * domain that has been migrated into @lumo/contracts, the route file must NOT
 * define its request/response body shape inline — it must import the schema
 * from the contract. We forbid the specific anti-pattern of passing an inline
 * object literal as the JSON body validator:  validate("json", z.object({…})).
 *
 * Path-param coercion (`validate("param", z.object({ id: … }))`) is allowed —
 * it is not an API request/response shape.
 *
 * To migrate a new domain: move its body schema into @lumo/contracts and add
 * the route file to MIGRATED_ROUTES below.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const routesDir = resolve(here, "../../routes");

const MIGRATED_ROUTES = ["tasks.ts", "people.ts"];

// Inline object schema used as a JSON body validator — the forbidden pattern.
// Routes call the project `validate(...)` wrapper; older code used `zValidator`
// directly, so match either to stay robust against an accidental regression.
const INLINE_JSON_BODY = /(?:validate|zValidator)\(\s*["']json["']\s*,\s*z\.object\s*\(/;

describe("Standards · Contract-First (migrated routes use @lumo/contracts)", () => {
  for (const file of MIGRATED_ROUTES) {
    test(`${file} does not define an inline JSON body schema`, () => {
      const src = readFileSync(resolve(routesDir, file), "utf8");
      assert.equal(
        INLINE_JSON_BODY.test(src),
        false,
        `${file} passes an inline z.object() as a JSON body validator — move the shape into @lumo/contracts`,
      );
    });

    test(`${file} imports from @lumo/contracts`, () => {
      const src = readFileSync(resolve(routesDir, file), "utf8");
      assert.ok(
        /from\s+["']@lumo\/contracts["']/.test(src),
        `${file} must import its request/response schema from @lumo/contracts`,
      );
    });
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
  const routeFiles = readdirSync(routesDir).filter((f) => f.endsWith(".ts"));
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
