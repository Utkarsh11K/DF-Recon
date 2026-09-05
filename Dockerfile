# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# DF-Recon — production Docker image
#
# This app is a self-contained Next.js frontend: all reconciliation state
# lives client-side (React state persisted to the browser's localStorage —
# see lib/store.tsx). There is no separate API server or database process,
# so a single "web" stage/service is all that's required to run the full
# product exactly as it behaves today.
#
# Multi-stage build:
#   1. deps    – install dependencies once, cached across builds
#   2. builder – compile the Next.js production build (standalone output)
#   3. runner  – minimal runtime image that only contains what's needed to
#                serve the built app
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=20-bookworm-slim

# ── deps ──────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── builder ───────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Bind inside the container; the host-side port is controlled by docker-compose.yml
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user inside the container
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# `output: 'standalone'` (next.config.ts) traces only the node_modules the
# server actually needs, keeping this final image small.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
