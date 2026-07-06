import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { httpError } from "./errors.js";

/**
 * Global request body-size limit — the coarse, byte-level backstop that the
 * per-array `.max()` caps (see the /migrate schemas) don't provide. Those caps
 * bound item *count*; this bounds *bytes*, so an oversized body is rejected at
 * the edge before JSON parsing / Zod ever run.
 *
 * Two tiers, because normal writes and bulk imports have very different honest
 * ceilings:
 *  - DEFAULT (2 MB): every ordinary write. Comfortably fits the largest single
 *    document — a project with the full 1 MB `content` field plus its other
 *    fields — with headroom, while rejecting anything pathological.
 *  - BULK (32 MB): the whole-dataset endpoints (the `/migrate` routes and
 *    `/v1/sync/push`) that legitimately move a user's entire export in one
 *    request. Set well
 *    above any realistic export so no genuine migration/sync is rejected, but
 *    still finite (vs. the effectively-unbounded bodies the count caps alone
 *    would permit).
 *
 * A rejected request gets the canonical `{ error: { code, message } }` envelope
 * at 413 — not Hono's default thrown HTTPException — so clients see the same
 * shape as every other error.
 */
export const BODY_LIMIT_DEFAULT = 2 * 1024 * 1024;
export const BODY_LIMIT_BULK = 32 * 1024 * 1024;

const onError = (c: Context) =>
  httpError(c, 413, "PAYLOAD_TOO_LARGE", "Request body is too large.");

const defaultLimit = bodyLimit({ maxSize: BODY_LIMIT_DEFAULT, onError });
const bulkLimit = bodyLimit({ maxSize: BODY_LIMIT_BULK, onError });

/** Bulk endpoints move a whole dataset in one request and get the larger tier. */
export function isBulkImportPath(path: string): boolean {
  return path.endsWith("/migrate") || path === "/v1/sync/push";
}

/**
 * Dispatches to exactly ONE bodyLimit per request (never both) so the request
 * body stream is only ever wrapped once.
 */
export const bodySizeLimit: MiddlewareHandler = (c, next) =>
  (isBulkImportPath(c.req.path) ? bulkLimit : defaultLimit)(c, next);
