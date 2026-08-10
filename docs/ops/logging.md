# Logging & Audit (Backend)

Production-grade, structured logging for the Lumo backend. Every log line is a
single JSON object (one per line, "JSON-lines") so an aggregator — Datadog, Loki,
CloudWatch Logs, Better Stack, … — can index fields instead of scraping text.

## The one seam

All backend logging goes through `backend/src/lib/logger.ts`:

```ts
import { log } from "../lib/logger.js";
log("info", { requestId, route: "GET /v1/user", msg: "…" });
```

Routes and middleware call `log(...)` rather than `console.*`. The audit helper
(`lib/audit.ts`) is a thin wrapper over the same seam. Only a few intentional
`console.error` calls remain: fatal boot failures in `index.ts` that must print
before the process exits, regardless of log level.

## Line schema

Every line carries a base envelope plus the caller's fields:

| Field     | Meaning                                                        |
|-----------|----------------------------------------------------------------|
| `level`   | `debug` \| `info` \| `warn` \| `error`                         |
| `ts`      | ISO-8601 UTC timestamp                                          |
| `service` | `lumo-backend`                                                 |
| `env`     | `NODE_ENV` (`production` / `development` / `test`)             |
| `version` | `LUMO_VERSION` (default `1.0.0`)                                |
| …fields   | caller-supplied (e.g. `requestId`, `route`, `status`, `msg`)   |

`error`-level lines go to **stderr**; everything else to **stdout**.

### Request access log
The correlation middleware (`app.ts`) emits one line per request:
`{ level:"info", requestId, method, path, status, durationMs, … }`. It is
suppressed under `NODE_ENV=test` to keep test output clean.

### Error log
`app.onError` logs unhandled faults with the `requestId`, method, path, message,
and server-side stack, and returns the same `requestId` to the caller — so a
user-reported error is traceable to one request without leaking internals.

## Correlation

Each request gets a trace id: a safe inbound `x-request-id` is honored, otherwise
one is generated. It is echoed on the response `x-request-id` header and attached
to the request/error logs. Route handlers read it with `c.get("requestId")` and
should include it when logging inside a `catch`.

## Levels & verbosity

Controlled by `LUMO_LOG_LEVEL` (read per-call, so it can be changed without a
code change): `debug` | `info` (default) | `warn` | `error` | `silent`. A line is
emitted only when its level is at or above the configured threshold. `silent`
suppresses everything (use sparingly — it also hides errors).

## Secret redaction (mandatory backstop)

Before serialization, any field whose **key** looks like a credential is replaced
with `[REDACTED]`, recursively, at every depth. Matched (case-insensitive,
substring): `password`, `token`, `secret`, `api_key`/`apiKey`, `authorization`,
`cookie`, `credential`, `refresh`, `private_key`, `session_id`, and similar.

This is a backstop, not the primary control — **still never pass secrets to the
logger.** It exists so a careless `log("info", { authorization })` cannot leak a
bearer token into the log stream. A test (`api/logger.test.ts`) asserts a planted
secret never reaches the emitted line.

> PII note: audit lines intentionally include `email` and `ip` for security
> forensics; these are **not** redacted. If a compliance regime requires masking
> them, extend the redaction key list (or hash the values) — the single seam
> makes that a one-file change.

## Audit log

Security-relevant events are logged via `audit(event, fields)`, which emits a
normal log line tagged `category: "audit"` and `audit: "<event>"` (plus the base
envelope). Grep/alert on `category:"audit"`.

Current audit events:

| Event                                  | When                                        |
|----------------------------------------|---------------------------------------------|
| `auth.register`                        | Account created                             |
| `auth.signin.ok` / `auth.signin.fail`  | Sign-in success / failure (with reason)     |
| `auth.signout`                         | Sign-out                                    |
| `auth.refresh.ok` / `auth.refresh.fail`| Refresh-token rotation success / failure    |
| `auth.password_change` / `…​.fail`      | Password change success / wrong current pw  |
| `auth.password_reset.request`          | Reset requested for a known email           |
| `auth.password_reset.request_unknown`  | Reset requested for an unknown email        |
| `auth.password_reset.ok` / `…​.fail`    | Reset completed / invalid-or-expired token  |

Pass identifiers only (`userId`, `email`, `ip`) — never secrets.

## Configuration

| Env var           | Default        | Purpose                              |
|-------------------|----------------|--------------------------------------|
| `LUMO_LOG_LEVEL`  | `info`         | Minimum level to emit; `silent` = off|
| `LUMO_VERSION`    | `1.0.0`        | Stamped on every line as `version`   |
| `LUMO_LOG_FILE`   | *(unset)*      | If set, also append every emitted line to this file |

## Local file sink (self-hosted / VPS)

Set `LUMO_LOG_FILE=/var/log/lumo/backend.log` to **also** append every emitted
line to that file, in addition to stdout/stderr. This is the zero-dependency
option for a self-hosted VPS deployment that keeps logs on disk instead of
shipping them to a hosted aggregator (no Sentry / third-party log service
required).

- The file receives the **same lines** the console does: the `LUMO_LOG_LEVEL`
  filter and secret redaction are applied first, so `LUMO_LOG_FILE` never
  captures more than the console (and never a raw secret).
- The parent directory is created on first write if missing.
- A write failure (bad path, full disk, permissions) **disables the sink** and
  prints a one-time `{"msg":"log file sink disabled",…}` line to stderr — it
  never throws into a request handler, so a misconfigured path degrades to
  "console-only", never a crash.
- Rotate it with the OS: point `logrotate` (or systemd's `journald` if you run
  the service under systemd and log to stdout instead) at the file. The process
  reopens the path lazily, so `copytruncate` works.

Example (systemd unit): `Environment=LUMO_LOG_FILE=/var/log/lumo/backend.log`.

## Shipping to an aggregator

The process logs to stdout/stderr; the platform collects them:

- **Render**: captured automatically; add a Log Stream to forward to a provider.
- **Docker/K8s**: the stdout JSON is picked up by the node agent / sidecar.
- **Self-hosted VPS**: use `LUMO_LOG_FILE` (above) and/or systemd `journald`.
- Point your collector at the JSON-lines format and index `level`, `requestId`,
  `route`, `status`, `durationMs`, and `category` for dashboards and alerts.
```
