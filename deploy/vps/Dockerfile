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

# The bundle + its externalized runtime deps (@libsql/client → native libsql).
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/package.json ./package.json
# SPA served same-origin from ./web (LUMO_WEB_ROOT is cwd-relative).
COPY --from=build /app/web-app/dist ./web

ENV LUMO_WEB_ROOT=web
ENV PORT=8080
EXPOSE 8080

# Run unprivileged (the base image ships a "node" user).
USER node

# Liveness for the reverse proxy / orchestrator: GET /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/bundle.cjs"]
