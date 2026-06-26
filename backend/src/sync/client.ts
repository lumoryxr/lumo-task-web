/**
 * Desktop sync client — the push-then-pull cycle (ADR-0004 Addendum, 2026-06-26;
 * P1b-core FR3–FR5).
 *
 * The cycle runs inside the LOCAL backend. Each cycle is push-then-pull:
 *   1. `engine.pull(localUserId, pushCursor)` reads LOCAL rows changed since the
 *      push cursor. If any → `cloud.push(token, entities)`. On success advance
 *      `pushCursor` to the local pull's cursor.
 *   2. `cloud.pull(token, pullCursor)` reads CLOUD rows since the pull cursor. If
 *      any → `engine.push(localUserId, entities)` applies them into the LOCAL DB
 *      with LWW (forcing the LOCAL user_id). On success advance `pullCursor` to
 *      the cloud response cursor.
 *
 * Identity mapping is automatic and needs no per-row remapping: the cloud's
 * `/push` forces the CLOUD user_id from its JWT, and the local `engine.push`
 * forces the LOCAL user_id. One local user ↔ one cloud user per install.
 *
 * Cursors advance ONLY on success. Any error → record last_error, do NOT advance
 * cursors, surface/return — a retry re-fetches safely (FR3 / AC5).
 *
 * Single-flight per user: overlapping `runSyncCycle` calls for the same user
 * await the in-flight one instead of racing two cycles against the same cursors.
 */
import { pull as enginePull, push as enginePush } from "./engine.js";
import type { CloudClient } from "./cloudClient.js";
import { httpCloudClient } from "./cloudClient.js";
import {
  getState,
  getDecryptedToken,
  bind,
  unbind,
  recordSuccess,
  recordError,
  type SyncClientState,
} from "./clientState.js";
import type { SyncRow, SyncStatusResponse } from "@lumo/contracts";

export interface SyncCycleResult {
  pushed: number;
  pulled: number;
  pushCursor: string;
  pullCursor: string;
}

/** Does this entity map carry at least one row? */
function hasRows(entities: Record<string, SyncRow[]>): boolean {
  for (const k of Object.keys(entities)) {
    if (entities[k] && entities[k].length > 0) return true;
  }
  return false;
}

// In-flight cycles keyed by local userId — the single-flight guard (FR6).
const inFlight = new Map<string, Promise<SyncCycleResult>>();

export interface RunCycleOpts {
  /** Cloud base URL for error/audit context (not used for routing). */
  cloudBase?: string;
}

/**
 * Run ONE push-then-pull cycle for `localUserId` against the injected `cloud`.
 * Reads binding/cursor state, drives the cycle, persists results. Throws if not
 * enabled. Single-flight per user.
 */
export async function runSyncCycle(
  localUserId: string,
  cloud: CloudClient,
  token: string,
  _opts: RunCycleOpts = {},
): Promise<SyncCycleResult> {
  const existing = inFlight.get(localUserId);
  if (existing) return existing;

  const p = (async () => {
    const state = await getState(localUserId);
    let pushCursor = state.pushCursor;
    let pullCursor = state.pullCursor;
    let pushed = 0;
    let pulled = 0;

    try {
      // ── Phase 1: PUSH local → cloud ────────────────────────────────────────
      const local = await enginePull(localUserId, pushCursor);
      if (hasRows(local.entities)) {
        const res = await cloud.push(token, local.entities);
        pushed = res.applied;
        // Advance to the LOCAL pull's cursor (the high-watermark of what we read
        // and shipped), NOT the cloud's applied cursor — the cloud may LWW-skip
        // rows it already has, but we have still SEEN everything up to
        // local.cursor, so re-pushing them is wasted work. On success only.
        pushCursor = local.cursor;
      }

      // ── Phase 2: PULL cloud → local ────────────────────────────────────────
      const remote = await cloud.pull(token, pullCursor);
      if (hasRows(remote.entities)) {
        const res = await enginePush(localUserId, remote.entities);
        pulled = res.applied;
      }
      // Advance the pull cursor to the cloud's high-watermark even when nothing
      // applied (LWW no-ops still mean we've consumed up to remote.cursor).
      pullCursor = remote.cursor;

      await recordSuccess(localUserId, pushCursor, pullCursor, new Date().toISOString());
      return { pushed, pulled, pushCursor, pullCursor };
    } catch (err) {
      // Any HTTP/network/apply error: record it and do NOT advance cursors. The
      // persisted cursors stay at their pre-cycle values (we never wrote the
      // partial advance), so the next cycle safely re-fetches.
      const message = err instanceof Error ? err.message : String(err);
      await recordError(localUserId, message);
      throw err;
    }
  })();

  inFlight.set(localUserId, p);
  try {
    return await p;
  } finally {
    inFlight.delete(localUserId);
  }
}

/** Build the local-backend status view (NEVER the token). */
function toStatus(mode: string, state: SyncClientState): SyncStatusResponse {
  return {
    mode,
    enabled: state.enabled,
    lastSyncedAt: state.lastSyncedAt,
    lastError: state.lastError,
    pushCursor: state.pushCursor,
    pullCursor: state.pullCursor,
  };
}

export interface EnableArgs {
  email: string;
  password: string;
  cloudBase: string;
}

/**
 * Enable/bind sync for `localUserId`: sign into the cloud, store enabled=1 +
 * cloud base + ENCRYPTED token, reset cursors to MIN_HLC, then run a first full
 * two-way reconcile (LWW union — safe, all one user's data). Returns status.
 *
 * `makeClient` is injectable so tests drive a fake cloud; production uses the
 * real `httpCloudClient`.
 */
export async function enableSync(
  localUserId: string,
  args: EnableArgs,
  mode: string,
  makeClient: (baseUrl: string) => CloudClient = httpCloudClient,
): Promise<SyncStatusResponse> {
  const cloud = makeClient(args.cloudBase);
  // Sign in FIRST — if creds are bad we never touch local state.
  const { token } = await cloud.signin(args.email, args.password);
  await bind(localUserId, args.cloudBase, token);

  // First full reconcile (cursors are now MIN_HLC). A failure here records
  // last_error but leaves the binding enabled so the next /now can retry.
  try {
    await runSyncCycle(localUserId, cloud, token, { cloudBase: args.cloudBase });
  } catch {
    // last_error already recorded by runSyncCycle; surface status either way.
  }

  return toStatus(mode, await getState(localUserId));
}

/** Disable/unbind: enabled=0, clear token + last_error. Local data untouched. */
export async function disableSync(
  localUserId: string,
  mode: string,
): Promise<SyncStatusResponse> {
  await unbind(localUserId);
  return toStatus(mode, await getState(localUserId));
}

/**
 * Run one on-demand cycle using the STORED cloud base + decrypted token. Throws
 * `NOT_ENABLED` if the user has no active binding. `makeClient` injectable.
 */
export async function syncNow(
  localUserId: string,
  makeClient: (baseUrl: string) => CloudClient = httpCloudClient,
): Promise<SyncCycleResult> {
  const state = await getState(localUserId);
  if (!state.enabled || !state.cloudBase) {
    throw Object.assign(new Error("NOT_ENABLED"), { code: "NOT_ENABLED" });
  }
  const token = await getDecryptedToken(localUserId);
  if (!token) {
    throw Object.assign(new Error("NOT_ENABLED"), { code: "NOT_ENABLED" });
  }
  const cloud = makeClient(state.cloudBase);
  return runSyncCycle(localUserId, cloud, token, { cloudBase: state.cloudBase });
}

/** Status view for a user (NEVER the token). */
export async function syncStatus(
  localUserId: string,
  mode: string,
): Promise<SyncStatusResponse> {
  return toStatus(mode, await getState(localUserId));
}
