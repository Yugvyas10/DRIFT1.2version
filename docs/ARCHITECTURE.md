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

| Package                | Depends on                                         | Status after M6                                                                            |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `@drift/report-schema` | zod                                                | Vocabulary, `Change`, `Diagnostic`, `drift-diff/v1`, `drift-report/v1`, `drift-traffic/v1` |
| `@drift/rules`         | report-schema, zod                                 | The default ruleset (data) and the policy format                                           |
| `@drift/core`          | report-schema, rules, yaml, ajv                    | All six stages, `compare` (stage cache, stage events), report formats, Ingest snapshots    |
| `@drift/cli`           | core, report-schema, commander                     | The full `drift` command, `--upload`, `run` and `rerun`                                    |
| `@drift/github-action` | cli, core, @actions/\*                             | The Action, bundled into `dist/index.js`                                                   |
| `@drift/db`            | Prisma                                             | Data model, migrations, client                                                             |
| `@drift/platform`      | AWS SDK, bullmq, ioredis, pino, OpenTelemetry, zod | Storage, Redis, queue, run events, semaphore, logging, tracing (shared by web and worker)  |
| `@drift/bench`         | core                                               | Fixtures, performance and mutation benchmarks, `EVALUATION.md`                             |
| `@drift/web`           | core, db, platform, Next.js, next-auth             | Dashboard, REST API, SSE, rate limits, live run page                                       |
| `@drift/worker`        | core, db, platform, bullmq, piscina                | Consumes the run queue and runs the engine in a thread pool                                |

The rules in [`PLAN.md` §3.2](PLAN.md) are enforced by `eslint.config.mjs`, not by convention:

- `packages/core/src/**` may not import `fs`, `http(s)`, `net`, `child_process`, database, queue, storage or UI libraries, or any `@drift/*` package above it. `Math.random` is banned there, because engine output must be deterministic (ADR-0006).
- `packages/report-schema` and `packages/rules` may not import any other `@drift/*` package.
- `@drift/core` and the leaf packages may not import `@drift/platform` (infrastructure stays out of the engine).

## 3. Engine stages (Ingest and Diff built in M1; the rest M2–M3)

Ingest → Diff → Corpus → Verify → Classify → Report & Gate. Each stage is a pure function from typed inputs to a typed output. Each output carries a cache key: `sha256(JCS({stage, engineVersion, rulesVersion?, inputHashes}))`. Ingest produces a normalised IR and its content hash; Diff produces change records and the impact index. See [`modules/core.md`](modules/core.md) and ADR-0003.

## 4. Configuration and startup

- Each app validates its environment with zod when it starts and exits with a readable message if anything is missing or invalid:
  - `apps/web` validates in `next.config.ts`, so `next dev`, `next build`, `next start` and `next typegen` all stop early;
  - `apps/worker` validates in `runWorker`, then probes the database, Redis and storage (`--check` stops there).
- Variables are added in the milestone that first uses them. Each app ships an `.env.example`.
- Turborepo runs in strict environment mode. A task only sees the variables declared for it in `turbo.json` (for the web build and typecheck: the variables `apps/web` validates, such as `APP_URL`, `DATABASE_URL`, `REDIS_URL` and the `S3_*` settings). A new variable must be added there too, or CI builds without it.

## 5. Local services

`infra/docker-compose.yml` starts Postgres 18, Redis 8.8 and SeaweedFS 4.47 (S3 API on port 8333, bucket `drift-artifacts`), and Jaeger with `--profile tracing`. Every port binds to `127.0.0.1`, and the credentials are local-only defaults that can be overridden in `infra/.env`. SeaweedFS replaced MinIO because MinIO no longer publishes community images (PLAN risk R8). The platform code only uses the S3 API, so the store is swappable.

## 6. Build, test and CI

- `pnpm turbo run typecheck lint test build` runs each package's scripts in dependency order, with caching.
- Libraries compile with `tsc`, from `.ts`-extension imports rewritten to `.js` (`rewriteRelativeImportExtensions`). The same source therefore runs directly under Node's type stripping (`node src/main.ts`) and compiles to plain ESM. `erasableSyntaxOnly` keeps the source strippable (no enums, namespaces or parameter properties).
- Vitest with v8 coverage runs in every package, with thresholds: ≥ 90% for core and rules, ≥ 80% everywhere else. Because every package meets ≥ 80%, the overall figure (a weighted average of the packages) does too.
- CI (`.github/workflows/ci.yml`): format check, typecheck, lint, test and build, audit; gitleaks over the full history; docker compose services healthy and the worker's `--check`; integration tests of web, worker and platform against real services; end-to-end tests with the built app, worker and CLI; real-world fixtures; DRIFT on its own API contract. See [`modules/tooling.md`](modules/tooling.md).
