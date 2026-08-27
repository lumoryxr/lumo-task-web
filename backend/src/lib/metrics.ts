/**
 * Self-hosted Prometheus metrics — a plain `/metrics` scrape endpoint, no
 * outward SaaS integration. Your Prometheus scrapes it; alerting lives in
 * Prometheus/Alertmanager rules (see docs/ops/overview.md), not in the app. This
 * keeps monitoring in-process with nothing to onboard and no data leaving the box.
 *
 * Exposed series:
 *   • prom-client default process metrics (CPU, RSS/heap, event-loop lag, GC…)
 *   • lumo_http_requests_total{method,route,status}     — volume + error rates
 *   • lumo_http_request_duration_seconds{method,route}  — latency histogram
 *   • lumo_http_requests_in_flight                       — concurrency gauge
 *
 * Security: the endpoint is DISABLED unless LUMO_METRICS_TOKEN is set, and when
 * set it requires `Authorization: Bearer <token>` (constant-time compare). So a
 * public deploy never exposes operational metrics unauthenticated.
 */
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from "prom-client";
import { timingSafeEqual } from "node:crypto";

export const register = new Registry();
register.setDefaultLabels({ service: "lumo-backend" });

// Default process metrics are sampled at scrape time. Skipped under test to keep
// the node:test runner deterministic (no background sampler); the HTTP series
// below — the ones we actually assert on — are always active.
if (process.env.NODE_ENV !== "test") {
  collectDefaultMetrics({ register });
}

const httpRequestsTotal = new Counter({
  name: "lumo_http_requests_total",
  help: "Total HTTP requests handled, by method, matched route, and status code.",
  labelNames: ["method", "route", "status"] as const,
  registers: [register],
});

const httpRequestDuration = new Histogram({
  name: "lumo_http_request_duration_seconds",
  help: "HTTP request latency in seconds, by method and matched route.",
  labelNames: ["method", "route"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpInFlight = new Gauge({
  name: "lumo_http_requests_in_flight",
  help: "In-flight HTTP requests currently being served.",
  registers: [register],
});

// Shared AI cloud-key usage this month (label = YYYY-MM). Lets Prometheus
// alert at e.g. 80% of LUMO_AI_CLOUD_GLOBAL_CAP before the cap trips
// and starts returning limitReached to users. See
// docs/ops/vps-deployment.md §3.6. Lazy-aggregate on scrape (cheap,
// avoids a per-call counter.set() in the AI hot path). On any error
// (DB unreachable, schema missing, etc.) reports 0 with the current
// month label rather than failing the whole scrape — Prometheus can
// alarm on "absence of this series" separately if desired.
export const aiCloudGlobalUsed = new Gauge({
  name: "lumo_ai_cloud_global_used",
  help: "Cumulative calls against the shared Lumo Cloud AI key this month (YYYY-MM).",
  labelNames: ["month"] as const,
  registers: [register],
  async collect() {
    const month = new Date().toISOString().slice(0, 7);
    try {
      // Lazy-import to avoid a circular dep at module-load: db/client.js
      // pulls in lib/logger.js which we do not want at metrics-import time.
      const { queryOne } = await import("../db/client.js");
      const row = await queryOne<{ used: number }>(
        'SELECT used FROM ai_cloud_global WHERE month = :m',
        { m: month }
      );
      this.set({ month }, row?.used ?? 0);
    } catch {
      this.set({ month }, 0);
    }
  },
});

/**
 * Label the request by its MATCHED ROUTE PATTERN (e.g. /v1/tasks/:id), never the
 * raw path — otherwise ids/tokens would explode label cardinality and could leak
 * into metrics. Prefer Hono's matched-route pattern; if unavailable, fall back to
 * the first two path segments, which is still bounded and per-resource useful.
 */
export function routeLabel(c: Context): string {
  const routes = (c.req.matchedRoutes ?? []) as { path?: string }[];
  for (let i = routes.length - 1; i >= 0; i--) {
    const p = routes[i]?.path;
    if (p && p !== "*" && p !== "/*" && !p.endsWith("/*")) return p;
  }
  const segs = c.req.path.split("/").filter(Boolean).slice(0, 2);
  return segs.length ? "/" + segs.join("/") : "/";
}

/** Times every request and records volume/latency/concurrency. Skips /metrics. */
export const metricsMiddleware: MiddlewareHandler = async (c, next) => {
  if (c.req.path === "/metrics") return next();
  httpInFlight.inc();
  const stopTimer = httpRequestDuration.startTimer();
  try {
    await next();
  } finally {
    const method = c.req.method;
    const route = routeLabel(c);
    stopTimer({ method, route });
    httpRequestsTotal.inc({ method, route, status: String(c.res?.status ?? 0) });
    httpInFlight.dec();
  }
};

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Mounts GET /metrics on the given app. Off (404) unless LUMO_METRICS_TOKEN is
 * set; when set, requires a matching Bearer token. Not behind authMiddleware —
 * a Prometheus scraper can't present a user JWT — the metrics token gates it.
 */
export function registerMetricsRoute(app: Hono<any>): void {
  app.get("/metrics", async (c) => {
    const token = (process.env.LUMO_METRICS_TOKEN ?? "").trim();
    if (!token) return c.notFound();

    const auth = c.req.header("authorization") ?? "";
    const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!safeEqual(presented, token)) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid or missing metrics token" } }, 401);
    }

    c.header("Content-Type", register.contentType);
    return c.body(await register.metrics());
  });
}
