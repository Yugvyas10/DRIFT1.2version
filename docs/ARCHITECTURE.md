# Architecture

This document describes the system as it is built, milestone by milestone. The target design and its rationale are in [`PLAN.md`](PLAN.md) §3–4 and the [ADRs](adr/). Sections marked _(planned)_ describe code that does not exist yet.

## 1. Shape of the system

```
                    ┌──────────────────────────── customer CI ────────────────────────────┐
                    │  GitHub Action (M4) ──▶ drift CLI (M1+) ──▶ @drift/core (engine)    │
                    │        │                       │                                     │
                    │        │ job summary, PR comment, SARIF, exit code gates the merge   │
                    └────────┼───────────────────────┼─────────────────────────────────────┘
                             │ --upload (M5)         │
                             ▼                       │
   browser ◀── SSE (M6) ── apps/web (Next.js) ──▶ Postgres (runs, changes, evidence, audit)
                             │        │
                             │        └──▶ S3-compatible storage (artifacts, content-addressed)
                             ▼
                          Redis ◀──▶ apps/worker (M6) ──▶ @drift/core in worker_threads
```

One engine, many callers: the CLI, the Action, the worker and the tests all call `@drift/core`. The web app never re-implements engine logic; it stores and displays `drift-report/v1` documents.

## 2. Packages and dependency rules

| Package                | Depends on                                  | Status after M0                                                |
| ---------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `@drift/report-schema` | zod                                         | Shared vocabulary: severities, directions, fail-on, exit codes |
| `@drift/rules`         | zod                                         | Rules format id and rule id grammar                            |
| `@drift/core`          | report-schema, rules (from M1), node:crypto | Canonical JSON (RFC 8785) and content hashing                  |
| `@drift/cli`           | core, report-schema, commander              | `drift --version`, `--help`, exit-code mapping                 |
| `@drift/github-action` | cli _(planned, M4)_                         | Directory reserved (README only)                               |
| `@drift/db`            | Prisma _(planned, M5)_                      | Directory reserved (README only)                               |
| `@drift/bench`         | core, cli _(planned, M1/M3/M8)_             | Directory reserved (README only)                               |
| `@drift/web`           | Next.js, React, zod                         | Landing page, env validation, security headers                 |
| `@drift/worker`        | ioredis, pino, zod                          | Env validation, Redis readiness check                          |

The rules in [`PLAN.md` §3.2](PLAN.md) are enforced by `eslint.config.mjs`, not by convention:

- `packages/core/src/**` may not import `fs`, `http(s)`, `net`, `child_process`, database, queue, storage or UI libraries, or any `@drift/*` package above it. `Math.random` is banned there, because engine output must be deterministic (ADR-0006).
- `packages/report-schema` and `packages/rules` may not import any other `@drift/*` package.

## 3. Engine stages _(planned, M1–M3)_

Ingest → Diff → Corpus → Verify → Classify → Report & Gate. Each stage is a pure function from typed inputs to a typed output. Each output carries a cache key: `sha256(JCS({stage, engineVersion, rulesVersion?, inputHashes}))`. The hashing foundation for this (`canonicalJson`, `contentHash`) exists from M0. See [`modules/core.md`](modules/core.md).

## 4. Configuration and startup

- Each app validates its environment with zod when it starts and exits with a readable message if anything is missing or invalid:
  - `apps/web` validates in `next.config.ts`, so `next dev`, `next build`, `next start` and `next typegen` all stop early;
  - `apps/worker` validates in `runWorker`.
- Variables are added in the milestone that first uses them. Each app ships an `.env.example`.
- Turborepo runs in strict environment mode. A task only sees the variables declared for it in `turbo.json` (currently `APP_URL` for web build and typecheck).

## 5. Local services

`infra/docker-compose.yml` starts Postgres 18, Redis 8.8 and SeaweedFS 4.47 (S3 API on port 8333, bucket `drift-artifacts`). Every port binds to `127.0.0.1`, and the credentials are local-only defaults that can be overridden in `infra/.env`. SeaweedFS replaced MinIO because MinIO no longer publishes community images (PLAN risk R8). The platform code will only use the S3 API, so the store is swappable.

## 6. Build, test and CI

- `pnpm turbo run typecheck lint test build` runs each package's scripts in dependency order, with caching.
- Libraries compile with `tsc`, from `.ts`-extension imports rewritten to `.js` (`rewriteRelativeImportExtensions`). The same source therefore runs directly under Node's type stripping (`node src/main.ts`) and compiles to plain ESM. `erasableSyntaxOnly` keeps the source strippable (no enums, namespaces or parameter properties).
- Vitest with v8 coverage runs in every package, with thresholds: ≥ 90% for core and rules, ≥ 80% everywhere else. Because every package meets ≥ 80%, the overall figure (a weighted average of the packages) does too.
- CI (`.github/workflows/ci.yml`) has three jobs:
  1. format check; typecheck, lint, test and build; dependency audit;
  2. gitleaks over the full history;
  3. docker compose services must become healthy, and the worker must connect to Redis.
     See [`modules/tooling.md`](modules/tooling.md).
