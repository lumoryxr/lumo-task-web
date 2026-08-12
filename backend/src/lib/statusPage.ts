/**
 * Public status page served at GET /status (see app.ts).
 *
 * A self-contained, dependency-free HTML page that polls this same origin's
 * `/health` (liveness) and `/ready` (DB readiness) probes and renders a plain
 * "is it up?" answer — the lightweight "static page fed by /health + /ready"
 * described in docs/ops/runbook.md, with zero external account (no BetterStack /
 * Instatus). Same-origin fetch, so no CORS. Unauthenticated, like /health.
 *
 * Honest scope: because this page is served BY the backend, it can report a
 * healthy process with a degraded DB (the common blip), but a full process
 * outage would take the page down with it — external down-detection is the
 * uptime-monitor item tracked separately in #471. Kept as one const string so
 * the route stays a trivial `c.html(STATUS_PAGE_HTML)` and a test can assert its
 * markers without a DOM.
 */
export const STATUS_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Lumo — System status</title>
  <style>
    :root {
      --bg: #f7f8f8; --card: #ffffff; --text: #0b1a17; --muted: #5b6b66;
      --border: #e3e7e6; --up: #1a7f5a; --down: #c0392b; --warn: #b8860b;
      --up-bg: #e8f5ee; --down-bg: #fbeae8; --warn-bg: #fbf3e0;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0b0f0e; --card: #141a18; --text: #eef2f0; --muted: #9aa8a3;
        --border: #232b28; --up: #4ade80; --down: #f87171; --warn: #fbbf24;
        --up-bg: #12251c; --down-bg: #2a1614; --warn-bg: #241d0e;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; background: var(--bg); color: var(--text);
      font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex; align-items: flex-start; justify-content: center; padding: 48px 20px;
    }
    .wrap { width: 100%; max-width: 560px; }
    h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
    .sub { color: var(--muted); font-size: 13px; margin: 0 0 24px; }
    .banner {
      border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px;
      background: var(--card); display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
    }
    .dot { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; background: var(--muted); }
    .banner.up .dot { background: var(--up); } .banner.up { background: var(--up-bg); }
    .banner.down .dot { background: var(--down); } .banner.down { background: var(--down-bg); }
    .banner.warn .dot { background: var(--warn); } .banner.warn { background: var(--warn-bg); }
    .banner-title { font-weight: 600; font-size: 16px; }
    .card { border: 1px solid var(--border); border-radius: 12px; background: var(--card); overflow: hidden; }
    .row { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-top: 1px solid var(--border); }
    .row:first-child { border-top: none; }
    .row .name { font-weight: 500; }
    .row .desc { color: var(--muted); font-size: 12px; margin-top: 2px; }
    .pill { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
    .pill.up { color: var(--up); background: var(--up-bg); }
    .pill.down { color: var(--down); background: var(--down-bg); }
    .pill.warn { color: var(--warn); background: var(--warn-bg); }
    .foot { color: var(--muted); font-size: 12px; margin-top: 18px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    a { color: inherit; }
  </style>
</head>
<body>
  <main class="wrap" role="main">
    <h1>Lumo — System status</h1>
    <p class="sub">Live checks against this deployment's health probes. Auto-refreshes every 30s.</p>

    <div id="banner" class="banner" aria-live="polite">
      <span class="dot"></span>
      <span class="banner-title" id="banner-title">Checking…</span>
    </div>

    <div class="card">
      <div class="row">
        <div>
          <div class="name">API</div>
          <div class="desc">Process liveness (/health)</div>
        </div>
        <span class="pill" id="api-pill">…</span>
      </div>
      <div class="row">
        <div>
          <div class="name">Database</div>
          <div class="desc">Storage reachability (/ready)</div>
        </div>
        <span class="pill" id="db-pill">…</span>
      </div>
    </div>

    <div class="foot">
      <span id="checked">Last checked: —</span>
      <span><a href="https://github.com/lumoryxr/lumo-task-web/issues" rel="noopener">Report an issue →</a></span>
    </div>
  </main>

  <script>
    (function () {
      var banner = document.getElementById("banner");
      var bannerTitle = document.getElementById("banner-title");
      var apiPill = document.getElementById("api-pill");
      var dbPill = document.getElementById("db-pill");
      var checked = document.getElementById("checked");

      function set(el, cls, text) {
        el.className = el.id === "banner" ? "banner " + cls : "pill " + cls;
        if (text != null) { (el.id === "banner" ? bannerTitle : el).textContent = text; }
      }

      async function probe(path) {
        try {
          var res = await fetch(path, { cache: "no-store" });
          var body = await res.json().catch(function () { return {}; });
          return { ok: res.ok, body: body };
        } catch (e) {
          return { ok: false, body: null };
        }
      }

      async function refresh() {
        var health = await probe("health");
        var ready = await probe("ready");

        set(apiPill, health.ok ? "up" : "down", health.ok ? "Operational" : "Down");
        var dbUp = ready.ok && ready.body && ready.body.db === "up";
        set(dbPill, dbUp ? "up" : "down", dbUp ? "Operational" : "Down");

        if (health.ok && dbUp) {
          set(banner, "up"); bannerTitle.textContent = "All systems operational";
        } else if (health.ok && !dbUp) {
          set(banner, "warn"); bannerTitle.textContent = "Degraded — database unreachable";
        } else {
          set(banner, "down"); bannerTitle.textContent = "Major outage";
        }
        checked.textContent = "Last checked: " + new Date().toLocaleTimeString();
      }

      refresh();
      setInterval(refresh, 30000);
    })();
  </script>
</body>
</html>`;
