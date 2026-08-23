# Operations & Monitoring

Monitoring is **self-hosted and pull-based**: the backend exposes a standard
Prometheus `/metrics` endpoint that your own Prometheus scrapes. There is **no
external SaaS**, no DSN, no account to onboard, and no data leaves your
infrastructure. Alerting lives in Prometheus/Alertmanager rules, not in the app.

## Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health` | none | Liveness — process is up (no DB call). Render's `healthCheckPath`. |
| `GET /ready`  | none | Readiness — returns `503` when the DB is unreachable. For LB draining / uptime checks. |
| `GET /metrics` | Bearer token | Prometheus exposition. **Disabled (404) unless `LUMO_METRICS_TOKEN` is set.** |

## Enabling metrics

Set `LUMO_METRICS_TOKEN` to a random secret (in `render.yaml` it's
`generateValue: true`). While unset, `/metrics` returns `404` so it can never be
exposed publicly by accident. When set, scrapers must present
`Authorization: Bearer <token>` (constant-time compared); anything else gets `401`.

## Exposed series

- **Default process metrics** (via `prom-client`): `process_cpu_seconds_total`,
  `process_resident_memory_bytes`, `nodejs_heap_size_used_bytes`,
  `nodejs_eventloop_lag_seconds`, GC stats, …
- **Application metrics**:
  - `lumo_http_requests_total{method,route,status}` — request volume + error rates
  - `lumo_http_request_duration_seconds{method,route}` — latency histogram (p50/p95/p99 via `histogram_quantile`)
  - `lumo_http_requests_in_flight` — current concurrency

`route` is the **matched route pattern** (e.g. `/v1/tasks/:id`), never the raw
path — ids never enter labels, so cardinality stays bounded and no id leaks.

## Prometheus scrape config

```yaml
scrape_configs:
  - job_name: lumo-backend
    metrics_path: /metrics
    scheme: https
    authorization:
      type: Bearer
      credentials: "<LUMO_METRICS_TOKEN>"   # or credentials_file
    static_configs:
      # Public production origin (single-origin VPS serves the SPA and /v1 API
      # together, so /metrics lives here too). Self-hosters: point this at your
      # own backend host.
      - targets: ["task.lumoryxr.com"]
```

## Example alert rules

```yaml
groups:
  - name: lumo-backend
    rules:
      - alert: LumoBackendDown
        expr: up{job="lumo-backend"} == 0
        for: 2m
        labels: { severity: critical }
        annotations:
          summary: "Lumo backend is not scrapeable (down or unreachable)."

      - alert: LumoHigh5xxRate
        # >5% of requests 5xx over 5m
        expr: |
          sum(rate(lumo_http_requests_total{status=~"5.."}[5m]))
            / sum(rate(lumo_http_requests_total[5m])) > 0.05
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "5xx error rate above 5% for 5 minutes."

      - alert: LumoHighLatencyP95
        # p95 latency > 1s over 10m
        expr: |
          histogram_quantile(0.95,
            sum(rate(lumo_http_request_duration_seconds_bucket[10m])) by (le)) > 1
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "p95 request latency above 1s for 10 minutes."

      - alert: LumoEventLoopLag
        expr: nodejs_eventloop_lag_seconds{job="lumo-backend"} > 0.2
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "Node event-loop lag above 200ms — the process is saturated."

      - alert: LumoHighMemory
        expr: process_resident_memory_bytes{job="lumo-backend"} > 450e6
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "RSS above ~450MB — approaching a 512MB instance limit."
```

## Lifecycle notes

- **Graceful shutdown**: on `SIGTERM`/`SIGINT` (e.g. a Render redeploy) the server
  stops accepting new connections and drains in-flight requests (10s hard
  deadline) before exit, so a deploy doesn't drop requests mid-flight.
- **DB mode** is logged at boot (`database configured mode=…`); a
  connection/auth failure exits non-zero with the mode named, not a bare stack.
- **Structured logs**: one JSON line per request (`requestId`, `traceId`,
  `spanId`, `method`, `path`, `status`, `durationMs`); a 500 logs the same ids
  handed back to the caller, so a user-reported error is traceable to the exact
  request. Point your log drain (e.g. Render log stream) at these — no code
  change needed.

## OpenTelemetry & distributed tracing (pull model)

The whole observability stack is **pull-only and OpenTelemetry-compatible**: the
app exposes endpoints and stamps ids; **external collectors come and pull. The
app never pushes to any collector or SaaS** — there is no OTLP exporter and no
outbound egress. Only the endpoints below are opened, all authenticated.

| Signal | How it's exposed (pull) | OTel mapping |
|--------|-------------------------|--------------|
| **Metrics** | `GET /metrics` (Prometheus exposition, Bearer-token gated) — your Prometheus scrapes it. | Prometheus is a first-class OTel pull metrics transport. |
| **Traces (call chain)** | **Correlation-based**, not span export. Every request carries **W3C Trace Context** (`traceparent`) and every log line is stamped with `traceId`/`spanId`. Your log system pulls the JSON logs and reconstructs the call chain by `traceId`. | `traceparent` is OTel's standard context-propagation format. |
| **Logs** | JSON lines on stdout/stderr (and optionally `LUMO_LOG_FILE`) — pulled by your log agent (Loki/Vector/Fluent Bit/…). | OTel log correlation via `trace_id`/`span_id`. |

### Trace context (W3C `traceparent`)

- **Inbound**: a well-formed, non-zero `traceparent` (`00-<32hex trace>-<16hex
  span>-<2hex flags>`) is *continued* — its `trace_id` is reused so a chain that
  starts at your gateway/proxy stays one trace. A missing/malformed header is
  never trusted; a fresh trace is started. A new `span_id` is always minted for
  this hop.
- **Outbound**: every response echoes `traceparent` (with this hop's span) plus a
  convenience `X-Trace-Id` mirror, so a browser/proxy/support ticket can quote the
  trace id. These ids are not secrets.
- **Everywhere**: the ids live in an `AsyncLocalStorage` scope, so **every** log
  line for a request — access log, route logs, `audit` events, and the error log —
  auto-carries the same `traceId`/`spanId` with no per-call plumbing. Query your
  log store by `traceId` to see the full chain of one request.

### Correlate the three signals

`lumo_http_requests_total` / `_duration_seconds` are labelled by `route`; a slow
or erroring `route` in a metrics alert → filter logs to that `path` + time window
→ pull the matching `traceId` → read every line of that request. Metrics say
*what/when*, logs+trace_id say *which request and why*.

### Security of the ops surface

- `/metrics` is **404 until `LUMO_METRICS_TOKEN` is set**, then requires
  `Authorization: Bearer <token>` (constant-time compared) — never behind a user
  JWT (a scraper can't present one), never public by default.
- `/health` and `/ready` are intentionally unauthenticated and body-minimal (no
  internals) for load-balancer/uptime probes.
- Prefer not to expose `/metrics` on the public origin at all: either bind it to
  an internal interface or block the path at the reverse proxy (Caddy/Nginx) so
  only your monitoring network reaches it. The token is the backstop, not the
  only control.
- Trace ids are non-sensitive by design (random, carry no PII); the logger's
  key-based redaction still scrubs any credential-like field from every line.

### Upgrade path to real spans (if ever needed)

This design is deliberately dependency-free (no OTel SDK). If you later want a
graphical trace tree (waterfalls across DB calls etc.), the migration is additive:
add `@opentelemetry/sdk-node` with auto-instrumentation, keep the same
`traceparent` propagation, and either (a) run an **on-box OTel Collector** the app
sends OTLP to over `localhost` (in-box, still no external egress) which then
exposes pull endpoints, or (b) expose a bounded in-memory span buffer on a new
authenticated pull endpoint. Nothing about today's log/metrics contract changes.
