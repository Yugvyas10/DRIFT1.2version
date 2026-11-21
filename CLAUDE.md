# CLAUDE.md — DRIFT

Read this at the start of every session. The full specification is `docs/MASTER_PROMPT.md`; the current plan is `docs/PLAN.md`. If they conflict, `PLAN.md` (approved) wins; if something is unclear, ask.

## What DRIFT is

An API contract compatibility gate for CI/CD. It compares old vs new OpenAPI contracts and labels each change BREAKING (only with failing evidence), RISKY (structurally dangerous, unproven) or SAFE, then passes or fails the pipeline.

## Session start checklist

1. Read `docs/PLAN.md` — find the current milestone and its acceptance criteria.
2. Read `docs/INVENTORY.md` — know what is real and what is still SIMULATED.
3. Run `pnpm install && pnpm turbo run typecheck lint test` — start from green. If it is red, fix that first.

## Hard rules

- Engine logic lives only in `packages/core`. The web app, worker, CLI and Action call it; they never re-implement it.
- Never present a stub as working. Anything simulated is marked `SIMULATED` in code and UI and listed in `docs/INVENTORY.md`.
- No hand-written performance or accuracy numbers anywhere. Numbers come from `packages/bench` output only.
- BREAKING requires failing evidence. Missing evidence never produces SAFE.
- Every stage output is typed and content-addressed (inputs + engine version + rules version).
- Redaction is on by default. No remote `$ref` fetching by default. No secrets or PII in logs.
- Every API route checks session or API key, and every query is scoped to the organisation.
- When unsure of a library API, read its docs or installed types. Don't guess.
- New dependency or service → one-line justification in `PLAN.md` or an ADR in `docs/adr/`.

## Definition of done for any change

- Tests added or updated (regression test for every bug fix); coverage thresholds hold (core/rules ≥ 90%, overall ≥ 80%).
- `pnpm turbo run typecheck lint test build` passes.
- Relevant `docs/modules/<package>.md` updated, including "questions an examiner might ask".
- Conventional Commit message; small, reviewable commit.

## End of every milestone

Post a summary: what works (with the exact command to see it), test and coverage numbers from CI, what is still SIMULATED, what is next. Then stop for review.

## Commands

Setup (once): Node 24+, `npm install -g pnpm@12.6.0`, Docker. Then:

- Install: `pnpm install`
- Env files (web and worker refuse to start without them): `cp apps/web/.env.example apps/web/.env.local && cp apps/worker/.env.example apps/worker/.env`
- Local services: `docker compose -f infra/docker-compose.yml up -d --wait` (stop: `... down`, add `-v` to wipe data)
- Full check: `pnpm turbo run typecheck lint test build`
- Format: `pnpm format` (CI runs `pnpm format:check`)
- Database: `DATABASE_URL=postgresql://drift:drift-local-only@localhost:5432/drift pnpm --filter @drift/db run migrate:deploy` (apply migrations) · after changing `schema.prisma`: `... run migrate:dev`
- Web dev server: `pnpm --filter @drift/web dev` → http://localhost:3000
- Web integration tests (real Postgres and S3 in containers; needs Docker): `pnpm --filter @drift/web run test:integration`
- Web end-to-end tests: `pnpm turbo run build --filter=@drift/web --filter=@drift/cli && pnpm --filter @drift/web run test:e2e` (first time: `pnpm --filter @drift/web exec playwright install chromium`)
- Worker: `pnpm --filter @drift/worker dev`
- CLI (paths relative to `packages/cli`): `pnpm --filter @drift/cli exec drift validate <spec>` · `... drift diff --base <old> --head <new>` · `... drift compare --base <old|ref:path> --head <new> [--traffic <file>] [--policy <file>] [--format console,json,html,md,sarif,junit --out <dir>] [--no-cache] [--upload --project <slug> --api-url <url>, with DRIFT_API_KEY]` · `... drift explain <id> --report <json>` · `... drift rules list` · `... drift corpus inspect <traffic>`. Use `--no-cache` while changing engine code.
- Golden files: `UPDATE_GOLDEN=1 pnpm --filter @drift/core test` (and `--filter @drift/cli`, `@drift/report-schema`, `@drift/rules` for the published JSON Schemas), then review the diff.
- Real-world fixtures: `pnpm --filter @drift/bench run fixtures:fetch && pnpm --filter @drift/bench run fixtures:check`
- Secret scan: `sh scripts/secret-scan.sh` (full history; the pre-commit hook scans staged changes)
- Version bump: `pnpm changeset`
- GitHub Action: `pnpm --filter @drift/github-action run build` (re-bundles `dist/index.js`; commit it) · `... run bundle:check` (CI). Demo: `The-Singularity44/drift-sample-api`.
- Benchmarks: `pnpm --filter @drift/bench run all` (fixtures, perf, mutations; heavy: ask first), `... run perf --sizes 1000,10000 --no-fixtures` (quick, results/ only), `... run evaluation` (re-render `docs/EVALUATION.md` from `docs/evaluation/*.json`; CI checks it).

## Ownership (for docs and review)

P1 Prathamesh Yewale · P2 Yug Vyas · P3 Tanishq Chavan · P4 Pruthvi Gangapure (PLAN §5).

- Person 1: web UI · Person 2: auth, RBAC, API keys · Person 3: DB, ingestion API, storage, worker, SSE · Person 4: rules, classify/report, CLI gate, GitHub Action/App, CI, bench.
- Engine stages 1–4: owners as assigned in `PLAN.md`.
