import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  taskComponentSchemas,
  personComponentSchemas,
  errorComponentSchemas,
  userComponentSchemas,
  feedbackComponentSchemas,
} from "../openapi.js";

/**
 * Emits the contract-generated portion of the OpenAPI document.
 *
 * This is the seed that will progressively replace the hand-maintained
 * `docs/openapi.yaml`: as each domain migrates to `@lumo/contracts`, its schemas
 * appear here automatically. The backend already serves the live, generated spec
 * (with this Task schema) at `GET /docs/openapi.json`.
 */

const doc = {
  openapi: "3.0.3",
  info: {
    title: "Lumo Task API — generated component schemas",
    version: "1.0.0",
    description:
      "Auto-generated from @lumo/contracts Zod schemas. Do not edit by hand — " +
      "edit the contract and re-run `npm run gen:openapi -w @lumo/contracts`.",
  },
  components: {
    schemas: {
      ...taskComponentSchemas(),
      ...personComponentSchemas(),
      ...errorComponentSchemas(),
      ...userComponentSchemas(),
      ...feedbackComponentSchemas(),
    },
  },
};

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../../../docs/openapi.generated.json");
writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote generated OpenAPI schemas → ${out}`);
