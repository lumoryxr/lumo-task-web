import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { buildOpenApiDocument } from "@lumo/contracts";

/**
 * API documentation.
 *
 * The OpenAPI document is **generated** from the route registry in
 * `@lumo/contracts` — this file contains no schema and no path list of its own.
 * That is the whole point: a hand-written spec used to live here, covering 22 of
 * the 76 endpoints the server actually mounted, with no mechanism to notice the
 * gap. Now the document is derived from the same registry the parity test diffs
 * against the live Hono router, so an undocumented endpoint fails the build.
 *
 * To change what appears here: edit the schema and the route entry in
 * `packages/contracts/src/registry.ts`. Never edit generated output.
 */

const app = new Hono();

// Built once at module load — the registry is static, so rebuilding per request
// would burn CPU on every docs hit for an identical result.
const spec = buildOpenApiDocument({ version: process.env.npm_package_version ?? "1.0.0" });

app.get("/openapi.json", (c) => c.json(spec));

app.get("/", swaggerUI({ url: "/docs/openapi.json" }));

export default app;
