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
- **Structured logs**: one JSON line per request (`requestId`, `method`, `path`,
  `status`, `durationMs`); a 500 logs the `requestId` handed back to the caller,
  so a user-reported error is traceable to the exact request. Point your log
  drain (e.g. Render log stream) at these — no code change needed.
