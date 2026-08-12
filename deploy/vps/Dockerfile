# Single-image, single-process Lumo for a self-hosted VPS.
#
# The one Node process serves BOTH the JSON API (/v1, /docs) and the built SPA
# (same-origin, so no CORS): the backend mounts the static SPA when LUMO_WEB_ROOT
# is set (see backend/src/lib/webStatic.ts). Put TLS + a domain in front of it
# with the reverse proxy in this directory (Caddy = automatic HTTPS, or nginx +
# certbot). See docs/ops/vps-deployment.md.
#
# Build commands mirror the proven Render build (deploy/render.customer.template.yaml)
# so this image builds exactly what production builds.

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY . .

# 1) Shared contracts (must be built before backend + frontend consume it).
RUN npm --prefix packages/contracts ci --include=dev \
 && npm --prefix packages/contracts run build

# 2) Backend → dist/bundle.cjs (esbuild bundle; libsql stays external/native).
RUN npm --prefix backend ci --include=dev \
 && npm --prefix backend run build

# 3) Frontend → web-app/dist. VITE_API_BASE is inlined at BUILD time; default to
#    the same-origin "/v1" since this image serves the SPA and API together.
ARG VITE_API_BASE=/v1
RUN cd web-app \
 && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci \
 && VITE_API_BASE="$VITE_API_BASE" npm run build

# 4) Reduce backend deps to production-only for the runtime copy (the bundle
#    still needs the externalized native libsql client at runtime).
RUN npm --prefix backend ci --omit=dev

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
# serveStatic resolves LUMO_WEB_ROOT relative to cwd, so cwd must be the backend.
WORKDIR /app/backend

# gosu lets the entrypoint start as root (to fix the bind-mounted data disk's
# ownership) and then drop to the unprivileged app user before running the app.
RUN apt-get update \
 && apt-get install -y --no-install-recommends gosu \
 && rm -rf /var/lib/apt/lists/*

# The bundle + its externalized runtime deps (@libsql/client → native libsql).
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/package.json ./package.json
# SPA served same-origin from ./web (LUMO_WEB_ROOT is cwd-relative).
COPY --from=build /app/web-app/dist ./web

# Self-healing entrypoint: as root it makes the mounted data disk writable by the
# app user, then drops privileges with gosu. See the script header for the why.
COPY deploy/vps/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV LUMO_WEB_ROOT=web
ENV PORT=8080
EXPOSE 8080

# NOTE: no `USER node` here — the container starts as root so the entrypoint can
# chown the bind-mounted /data volume, then it execs the app via `gosu` as the
# unprivileged app user (uid 1000 by default; override with LUMO_UID/LUMO_GID).

# Liveness for the reverse proxy / orchestrator: GET /health. HEALTHCHECK does not
# run through ENTRYPOINT, so it stays a plain node one-liner.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/bundle.cjs"]
