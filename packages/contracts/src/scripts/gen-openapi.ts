import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildOpenApiDocument } from "../openapi.js";

/**
 * Writes the OpenAPI document to `docs/api/openapi.json`.
 *
 * The bytes are identical to what the backend serves at `GET /docs/openapi.json`
 * — both call {@link buildOpenApiDocument} over the same route registry. The
 * committed file exists so the spec is diffable in code review: an API change
 * shows up as a spec change in the same pull request.
 *
 * `make ci` regenerates it and fails if the result differs from what is
 * committed, so a contract edit that skips this step cannot merge.
 */

const doc = buildOpenApiDocument();

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../../../../docs/api");
const out = resolve(outDir, "openapi.json");

mkdirSync(outDir, { recursive: true });
writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");

const operations = Object.values(doc.paths as Record<string, object>).reduce(
  (n, methods) => n + Object.keys(methods).length,
  0,
);
console.log(`Wrote OpenAPI document (${operations} operations) → ${out}`);
