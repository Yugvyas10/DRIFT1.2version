# syntax=docker/dockerfile:1
# The DRIFT platform image (ADR-0009): the web app, the worker and the migration job, each started by one of the
# scripts in infra/container. Built and tested by CI (job `images`) and published to GitHub's container registry
# by .github/workflows/images.yml; nothing in it is specific to one host.

# Node 24 as in .nvmrc, pinned by digest (SECURITY T2).
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS base
# Prisma's migration engine is a native program: it picks its build by the OpenSSL version and checks the
# database's TLS certificate against the system's certificate store.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.6.0
ENV NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# `next build` validates the environment (SECURITY T4) but bakes none of it into the build: these placeholders,
# the same as CI's, only satisfy the check. The real values are the host's secrets, read when the processes start.
RUN APP_URL=http://localhost:3000 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    AUTH_SECRET=image-build-placeholder-not-a-secret-00000 \
    REDIS_URL=redis://localhost:6379 \
    S3_ENDPOINT=http://localhost:8333 \
    S3_BUCKET=build \
    S3_ACCESS_KEY_ID=build \
    S3_SECRET_ACCESS_KEY=build \
    pnpm turbo run build --filter=@drift/web --filter=@drift/worker
# Prisma downloads its migration engine for this platform on first use. Do it now, so the migration job
# downloads nothing at deploy time.
RUN cd packages/db && ./node_modules/.bin/prisma version
RUN rm -rf .turbo apps/web/.next/cache node_modules/.cache

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
# Not root (the image's `node` user).
USER node
EXPOSE 3000
# The host sets each container's command (infra/azure/main.bicep); on its own the image runs the web app.
CMD ["/app/infra/container/web.sh"]
