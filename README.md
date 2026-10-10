# DRIFT

**DRIFT runs inside a CI pipeline, compares the old and new OpenAPI contract of a REST API, proves with evidence whether the change would break real consumers, and blocks the merge if it would.**

A change is labelled **BREAKING** only when a concrete sample that the old contract accepts is rejected by the new one. A structurally dangerous change without such evidence is **RISKY**; everything else is **SAFE**. See [ADR-0002](docs/adr/0002-evidence-based-classification.md).

> **Status: rebuild in progress — milestone M1 (Ingest + Diff).** DRIFT can validate specs and list structural changes; evidence and the gate (Corpus, Verify, Classify, Report) arrive in M2–M3. What works today is listed below; everything else is planned in [`docs/PLAN.md`](docs/PLAN.md). Nothing in this repository presents a planned feature as working; see [`docs/INVENTORY.md`](docs/INVENTORY.md).

## What works today (M5)

| Area                                                                       | Try it                                                                                                                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Monorepo checks (typecheck, lint, test, build)                             | `pnpm turbo run typecheck lint test build`                                                                                                                                           |
| Validate a spec (located errors, exit 2 when invalid)                      | `pnpm --filter @drift/cli exec drift validate <spec>`                                                                                                                                |
| Compare two contracts with evidence and gate the result                    | `pnpm --filter @drift/cli exec drift compare --base ../../examples/petstore/v1.yaml --head ../../examples/petstore/v2-breaking.yaml --traffic ../../examples/petstore/traffic.jsonl` |
| Reports: console, JSON, Markdown, HTML, SARIF, JUnit                       | add `--format console,json,html,md,sarif,junit --out out/`                                                                                                                           |
| GitHub Action: PR comment, job summary, failing check                      | [`packages/github-action`](packages/github-action/README.md); demo: [drift-sample-api](https://github.com/The-Singularity44/drift-sample-api)                                        |
| Dashboard: sign-in, organisations and roles, API keys, audit log, run list | `pnpm --filter @drift/web dev` → http://localhost:3000                                                                                                                               |
| Upload a run to the dashboard                                              | `DRIFT_API_KEY=drift_… drift compare … --upload --project <slug> --api-url http://localhost:3000`                                                                                    |
| Measured accuracy and performance                                          | [`docs/EVALUATION.md`](docs/EVALUATION.md)                                                                                                                                           |
| Local services: Postgres, Redis, S3-compatible storage                     | `docker compose -f infra/docker-compose.yml up -d --wait`                                                                                                                            |
| Secret scan                                                                | `sh scripts/secret-scan.sh`                                                                                                                                                          |

Not built yet: live runs and the run canvas (M6–M7), the GitHub App (M8). `docs/INVENTORY.md` lists what is real and what is not.

## Quick start

Requirements: Node.js 24 LTS or newer, pnpm 12 (`npm install -g pnpm@12.6.0`), Docker.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/worker/.env.example apps/worker/.env
docker compose -f infra/docker-compose.yml up -d --wait
pnpm turbo run typecheck lint test build
DATABASE_URL=postgresql://drift:drift-local-only@localhost:5432/drift pnpm --filter @drift/db run migrate:deploy
pnpm --filter @drift/web dev   # http://localhost:3000: register, create an organisation, a project and an API key
```

The web app and the worker validate their environment at startup and refuse to run with a missing or invalid variable. That is why the two `.env` files are copied first.

## Repository layout

```
packages/core           engine (pure; I/O only through injected adapters)
packages/report-schema  drift-report/v1 contract
packages/rules          classification rules as versioned data
packages/cli            the `drift` command
packages/github-action  GitHub Action (M4): runs the gate in a pull request
packages/db             Prisma schema, migrations and client
packages/bench          benchmarks that produce every published number (M1, M3, M8)
apps/web                Next.js dashboard and REST API
apps/worker             queue worker (M6)
infra                   docker compose for local services
docs                    plan, inventory, architecture, security, ADRs, module docs
```

## Documentation

- [`docs/PLAN.md`](docs/PLAN.md): milestones, acceptance criteria, owners, risks, decisions
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): how the pieces fit together
- [`docs/SECURITY.md`](docs/SECURITY.md): threat model and security controls
- [`docs/INVENTORY.md`](docs/INVENTORY.md): what is real, what is not yet built
- [`docs/adr/`](docs/adr/): architecture decision records
- [`docs/modules/`](docs/modules/): one document per package

## Team

EDI Group 4, Vishwakarma Institute of Technology, Pune. Guide: Prof. (Smt) Sangita Lade.

| Role                                 | Person            |
| ------------------------------------ | ----------------- |
| P1 Frontend & UI                     | Prathamesh Yewale |
| P2 Auth, application logic, security | Yug Vyas          |
| P3 Database & backend                | Tanishq Chavan    |
| P4 Pipeline, CI/CD & testing         | Pruthvi Gangapure |
