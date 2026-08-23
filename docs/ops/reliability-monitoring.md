# Reliability: error tracking, uptime & alerting

> Runbook for the P0 reliability items in `docs/business/commercialization-readiness.md` §3
> and issue #471. Backup/restore is covered separately in
> [`database-backup.md`](./database-backup.md).
>
> **Current state:** the app already ships structured JSON logging with a
> per-request `x-request-id` (PR #153), a shallow liveness probe `GET /health`,
> and a DB-checking readiness probe `GET /ready` (503 when the DB is down). What
> is missing is **external** visibility: nobody is paged when it breaks. This
> doc makes that executable.

---

## 1. Error tracking (Sentry or equivalent)

**Why:** today a 5xx is only a line in the logs — you learn about outages from
users. `backend/src/app.ts:onError` already logs every server fault with its
`requestId`; the frontend already has an `ErrorBoundary`. Both need one more
step: forward the exception to an aggregator.

**Wiring point — backend** (`app.ts` `onError`, the "real server fault" branch):
after the existing `log("error", {...})` call, forward to the reporter. Keep it a
**no-op when `SENTRY_DSN` is unset** so local/dev and unconfigured deploys are
unaffected:

```ts
// lib/errorReporting.ts (new) — thin seam, safe without the SDK/DSN.
// Once the DSN is provisioned, `npm i @sentry/node` and init in index.ts.
export function reportError(err: unknown, ctx: Record<string, unknown>) {
  if (!process.env.SENTRY_DSN) return;      // unconfigured → no-op
  // Sentry.captureException(err, { extra: ctx });   // enable with the SDK
}
```

Call `reportError(err, { requestId, method: c.req.method, path: c.req.path })`
from the 5xx branch of `onError`. The `requestId` ties the Sentry event back to
the exact log line and to the id already returned in the 500 body.

**Wiring point — frontend** (`web-app/src/components/ErrorBoundary.tsx`
`componentDidCatch`): mirror the same no-op-without-DSN seam, gated on
`import.meta.env.VITE_SENTRY_DSN`.

**Env / secrets:** `SENTRY_DSN` (backend, Render env) and `VITE_SENTRY_DSN`
(frontend build). Both optional — absence disables reporting, never breaks a build.

**Decision needed before install:** pick the aggregator (Sentry vs OTel collector)
and provision the DSN. Until then this stays a documented seam, not a dependency.

---

## 2. Uptime monitoring + alerting

**Probes the app already exposes:**

| Endpoint | Meaning | Use for |
|----------|---------|---------|
| `GET /health` | Process is up (no DB call) | Render `healthCheckPath`; cheap uptime ping |
| `GET /ready`  | DB reachable (`SELECT 1`), 503 if not | External readiness/alerting; catches Turso outages |

**Set up (any of UptimeRobot / BetterStack / Pingdom / Render's own checks):**

1. **Liveness monitor** → `GET /health`, expect `200 {ok:true}`, interval 1–5 min.
2. **Readiness monitor** → `GET /ready`, expect `200` and alert on `503`
   (distinguishes "DB down" from "process down").
3. **Alert channel** → email + a chat webhook (Slack/Discord/Feishu); set a sane
   re-notify interval so a flap doesn't spam.

**Alert on, at minimum:**

- endpoint down / `5xx` from `/health` or `503` from `/ready`;
- elevated backend error rate (from logs / Sentry once §1 is live);
- **payment webhook failures** — deferred until billing (#470) exists, but wire
  the alert at the same time as the webhook so a silent dropped `invoice.paid`
  can't go unnoticed.

**Status page (support obligation, see #473):** point a lightweight status page
(BetterStack / Instatus / a static page) at the same probes so users have a
canonical "is it down?" answer during incidents.

---

## 3. Checklist (turns §3 todos into actions)

- [ ] Decide aggregator + provision `SENTRY_DSN` / `VITE_SENTRY_DSN` → then add the
      `reportError` seam + SDK (§1).
- [ ] Create liveness + readiness monitors with an alert channel (§2).
- [ ] Add a public status page fed by the same probes (#473).
- [ ] When billing lands (#470): add a payment-webhook-failure alert.

> None of the above requires app-logic changes beyond the two small `reportError`
> seams; the probes and structured logging are already in production.
