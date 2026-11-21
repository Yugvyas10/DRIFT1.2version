# PLAN — DRIFT rebuild

**Status: APPROVED 2026-09-26** (roles assigned; all other recommendations in §10 accepted as written). This file wins over `MASTER_PROMPT.md` wherever they differ. Decisions are recorded in §10.

**Current milestone: M0 — Foundations: complete, awaiting review (2026-09-26). Next: M1.**

Related: [`INVENTORY.md`](INVENTORY.md) (current state) · [`adr/`](adr/) (decisions) · [`MASTER_PROMPT.md`](MASTER_PROMPT.md) (full specification).

---

## 1. What we are building

**One sentence.** DRIFT runs inside a CI pipeline, compares the old and new OpenAPI contract of a REST API, proves with evidence whether the change would break real consumers, and blocks the merge if it would.

**Labels.** Every change gets exactly one label:

- **BREAKING**: at least one concrete sample, valid under the old contract, fails under the new one. The label carries the failing, redacted payload.
- **RISKY**: structurally dangerous, but no failing sample was found. Missing evidence never produces SAFE.
- **SAFE**: structurally safe under the direction rules.

Every label carries a rule id, rationale, confidence and evidence counts (ADR-0002).

**Non-goals.** Generic CI log analysis, billing, Kubernetes/Helm, services beyond `web` + `worker`, GraphQL/gRPC/SOAP/AsyncAPI (ingestion is designed as an adapter so they could be added), and ML in the core path.

## 2. Deck objectives → what we build

| Deck objective (slide 8)        | Realised as                                                                                                                                             | Milestone                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1. Interactive canvas, 6 stages | Live canvas of a real run: Ingest → Diff → Corpus → Verify → Classify → Report & Gate                                                                   | M7 (data from M5/M6)       |
| 2. Context-aware inspector      | Per-stage inputs, outputs, logs, timings, artifacts and evidence, all read from the stored run                                                          | M7                         |
| 3. Replay engine                | Content-addressed stage outputs (ADR-0006) → re-run any stage with a new corpus, rules or policy while reusing the upstream outputs                     | M2 (engine), M6 (platform) |
| 4. Smart classification         | BREAKING/RISKY/SAFE with rule id, confidence and evidence, plus a run-failure cause category (`INVALID_SPEC`, `CONFIG`, `INFRA`, `INTERNAL`, `TIMEOUT`) | M2, M6                     |
| 5. Real-time state              | SSE backed by Redis pub/sub, with `Last-Event-ID` resume (ADR-0004; deviates from the deck's WebSockets)                                                | M6                         |
| 6. Secure multi-tenancy         | Org-scoped queries, OWNER/ADMIN/MEMBER/VIEWER enforced server-side, scoped API keys, audit log                                                          | M5                         |

## 3. Architecture

### 3.1 Repository layout (pnpm workspaces + Turborepo, TypeScript `strict`, Node LTS)

```
drift/
├─ packages/
│  ├─ core/            engine: ingest, diff, corpus, verify, classify, report (no network, no DB; I/O via injected adapters)
│  ├─ report-schema/   drift-report/v1: zod types + generated JSON Schema (the contract between everything)
│  ├─ rules/           default rules as versioned data + loader + validation
│  ├─ cli/             `drift` binary
│  ├─ github-action/   Action wrapping the CLI (bundled single file)
│  ├─ db/              Prisma schema, migrations, client, seed
│  └─ bench/           fixtures fetcher, mutation benchmark, perf benchmark, EVALUATION.md generator
├─ apps/
│  ├─ web/             Next.js App Router: dashboard + REST API (BFF) + OpenAPI spec of DRIFT's own API
│  └─ worker/          BullMQ consumer running core in a worker_threads pool
├─ infra/              docker-compose (Postgres, Redis, S3-compatible store, Jaeger), Dockerfiles
├─ examples/           small bundled specs + traffic used by docs, golden tests and DEMO seed
└─ docs/               PLAN, INVENTORY, ARCHITECTURE, SECURITY, EVALUATION (generated), adr/, modules/
```

Shared config lives at the root (`tsconfig.base.json`, `eslint.config.mjs`, `vitest.config.ts` in projects mode), not in extra packages.

### 3.2 Dependency rules (enforced by ESLint `no-restricted-imports` + a CI check)

- `core` → `report-schema`, `rules` only. No `fs`, `http`, `pg`, `redis` or `@aws-sdk` imports. File, git and storage access happen through adapter interfaces that the caller passes in.
- `cli`, `github-action`, `worker` and `web` → `core`. **None of them re-implement engine logic** (CLAUDE.md hard rule).
- `web` never imports `core` into client bundles. Runs execute in the worker or the CLI.

### 3.3 Data flow

- **CLI/Action mode (M3–M4).** The CI job runs `drift compare` → report in 6 formats → exit code gates the job. `--upload` also sends the report and artifacts to the platform (M5).
- **Platform mode (M5–M6).** `POST /api/v1/runs` (API key, idempotent) → metadata to Postgres, artifacts to S3-compatible storage under org-scoped, content-addressed keys → dashboard. Server-side runs and stage re-runs are queued to the worker, and progress streams over SSE.
- **App mode (M8).** GitHub App webhook → verify HMAC → idempotency key (repo + PR + head SHA + spec hashes) → queue → worker fetches both spec versions → engine → Check Run with annotations.

## 4. Engine design (`packages/core`)

The six stages are pure functions, `(typed inputs, adapters) → typed output`. Each output carries `cacheKey = sha256(JCS({stage, engineVersion, rulesVersion?, inputHashes…}))` (ADR-0006). Details are fixed during implementation and recorded in `docs/modules/core.md`. The decisions below are the plan.

### 4.1 Stage 1 — Ingest (owner P3)

- Parse YAML/JSON with `yaml` (source positions via `LineCounter`), with limits on file size, alias count and nesting depth (billion-laughs protection). Detect OAS `3.0.x` / `3.1.x`, and reject Swagger 2.0 with a clear message (it could be an adapter later).
- Validate against the official OAS JSON Schemas (3.0: draft-04; 3.1: draft 2020-12) with ajv. Every error is reported as `file:line:col` plus a JSON pointer.
- `$ref` resolution (ADR-0003): internal refs always; local files only inside `--ref-root` (default: the spec's directory; `..` and symlink escapes rejected); remote HTTP refused unless `--allow-remote-refs` is given. Cycles are kept as refs, never fully dereferenced.
- Normalise into the IR:
  - operation key = `METHOD /path/{}` with param names erased (`/users/{id}` ≡ `/users/{userId}`), while the names are kept for rename detection;
  - params by (location, name);
  - request body and responses per status code **and** media type;
  - schemas: 3.0 `nullable` → type arrays, boolean `exclusiveMinimum/Maximum` → numeric form, safe `allOf` merge (only when there are no conflicting keywords, otherwise left as `allOf`), `oneOf`/`anyOf`/`discriminator` preserved.
- The IR also holds a pointer → source-position map, used for located errors and for SARIF.
- Content hash of the normalised spec (JCS canonical JSON + SHA-256). This hash keys every downstream cache.

### 4.2 Stage 2 — Diff (owner P4)

- Output: `Change { id = sha256(kind + location), kind, direction: request|response|n/a, location (JSON pointer in head, or base if removed), operationKey, before, after, candidateSeverity }`.
- Recursive schema diff with a visited set of `(baseRef, headRef)` pairs, so recursive schemas terminate.
- Impact index: `operationKey → Change[]`. Corpus and Verify only touch operations in this index.
- Change catalogue and default direction semantics. This table becomes the M2 default ruleset. "Dangerous" means RISKY by default, and BREAKING only with failing evidence.

| Change kind                                                            | Request (server accepts)                                | Response (server returns) |
| ---------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------- |
| `path.added`, `operation.added`                                        | safe (additive)                                         | —                         |
| `path.removed`, `operation.removed` (method removed)                   | dangerous                                               | —                         |
| `path.param.renamed` (same position)                                   | safe (names are not on the wire)                        | —                         |
| `param.added` required / optional                                      | dangerous / safe                                        | —                         |
| `param.removed`, `param.location_changed`                              | dangerous                                               | —                         |
| `param.made_required` / `param.made_optional`                          | dangerous / safe                                        | —                         |
| `request.body.made_required`, `request.body.removed`                   | dangerous                                               | —                         |
| `schema.property.added` (required)                                     | dangerous                                               | safe*                     |
| `schema.property.added` (optional)                                     | safe                                                    | safe*                     |
| `schema.property.removed`                                              | dangerous                                               | dangerous                 |
| `schema.property.made_required` / `made_optional`                      | dangerous / safe                                        | safe / dangerous          |
| `schema.type.narrowed` / `schema.type.widened`                         | dangerous / safe                                        | safe / dangerous          |
| `schema.format.changed`                                                | dangerous                                               | dangerous                 |
| `schema.enum.value_removed` / `value_added`                            | dangerous / safe                                        | safe / dangerous          |
| `schema.bound.tightened` / `relaxed` (min/max, length, items, pattern) | dangerous / safe                                        | safe / dangerous          |
| `schema.additional_properties.tightened`                               | dangerous                                               | safe*                     |
| `schema.default.changed`                                               | dangerous (behavioural, cannot be proven → stays RISKY) | safe                      |
| `response.status.added` (2xx / 4xx-5xx)                                | —                                                       | dangerous / safe          |
| `response.status.removed`                                              | —                                                       | dangerous                 |
| `media_type.added` / `removed`                                         | safe / dangerous                                        | dangerous / dangerous     |
| `*.deprecated`                                                         | safe (policy may escalate to RISKY)                     | safe                      |
| `security.requirement.added` / `removed`                               | dangerous / safe                                        | —                         |
| `doc.changed` (summary, description, examples)                         | safe, hidden by default                                 | safe                      |

\*Evidence can still prove BREAKING. For example, if the _old_ response schema had `additionalProperties: false`, a new-schema sample with the extra property fails the old schema.

The rule is symmetric: **narrowing what the server accepts breaks clients (request), and widening what the server returns breaks strict clients (response).**

### 4.3 Stage 3 — Corpus (owner P3; redaction module P2; change-directed synthesis P4)

- **Traffic format.** JSONL traffic format `drift-traffic/v1`, documented with a JSON Schema: `method, path, query, headers, requestBody, status, responseHeaders, responseBody, timestamp, clientId?`. HAR import is also supported.
- **Streaming.** Input is streamed line by line with async iteration, so backpressure is natural and memory stays bounded. Malformed lines are counted, and the first N are reported by line number. They are never fatal.
- **Redaction before storage or reporting, on by default.** Covers `Authorization`, `Cookie`, `Set-Cookie`, `Proxy-Authorization`, `X-Api-Key`; a configurable header and body-field denylist; and detectors for email, JWT, bearer tokens, common cloud key formats and Luhn-valid card numbers. **Every redacted JSON pointer is recorded.** Verify treats validation errors _at a redacted pointer_ as "unknown", never as a failure, so redaction can never create a false BREAKING (see risk R6).
- **Stratified sampling.** Deterministic reservoir sampling per operation with a global cap. Coverage is reported honestly, e.g. "checked N of M samples, K% of affected operations".
- **Synthetic samples.** Seeded generation from the **old** contract for affected operations when no traffic is given, or when traffic misses an operation. It covers required fields, enum values and boundary values. It is _change-directed_: for `enum.value_removed` it generates the removed value; for `bound.tightened` it generates values between the old and new bound. Every synthetic sample is tagged `synthetic: true`, and every report format states it prominently. Written in-house (no faker dependency), so it is deterministic and explainable.

### 4.4 Stage 4 — Verify (owner P3)

- **Evidence definition.**
  - Request direction: a sample is evidence only if it is **valid under the old contract and invalid under the new one**. Samples invalid under both are reported separately as pre-existing non-conformance, not as evidence.
  - Response direction: samples generated from the new response schema are validated against the old one. Recorded responses are validated against the new schema (informational).
- **Routing.** Recorded requests are matched to operations by a path-template router that handles the `servers` base path.
- **Validators.** An OAS→JSON Schema conversion (3.0 keywords) feeds ajv. Validators are compiled lazily **once per (specHash, operationKey, direction, status, mediaType)** and cached.
- **Execution.** Validation runs in a `worker_threads` pool (piscina) when the corpus is above a threshold, and inline for small inputs.
- **Output.** Per change: `checked`, `failed`, split into recorded and synthetic, plus the first N failing payloads (redacted) with ajv error paths.

### 4.5 Stage 5 — Classify (owner P4)

- Rules are data in `packages/rules` (ADR-0005). Each rule has: `id`, `kind`, `direction`, `when` (a condition on the change and its evidence), `severity`, `rationale`, `additive` (for semver).
- **Policy.**
  - `--fail-on breaking|risky` (default `breaking`).
  - Per-project overrides, e.g. deprecations → RISKY.
  - **Suppressions** need a `reason`, an `expiresAt` and a match (change id, or rule + location glob). Expired suppressions are ignored and reported. In platform mode, creating or removing a suppression is audited.
- **Confidence** (ADR-0002; final formula fixed and tested in M2). Principles:
  1. Recorded failing evidence → confidence 1.0.
  2. Synthetic-only failing evidence → below 1.0, and falling as more recorded traffic reaches the location without failing.
  3. No failing evidence → confidence grows with the number _n_ of recorded samples that reached the location, using the rule-of-three bound: with 0 failures in _n_ samples, the 95% upper bound on the failing share is 3/_n_.
  4. _n_ = 0 → the label is flagged `unverified`.
     All parameters live in the rules file, not in code.
- **Semver recommendation.** `major` if any BREAKING (or RISKY, unless policy says otherwise), `minor` if any additive change, `patch` otherwise.

### 4.6 Stage 6 — Report & Gate (owner P4; HTML template P1)

- **Formats:**
  - console (colour, respects `NO_COLOR`);
  - **JSON `drift-report/v1`**, validated against its schema before it is written;
  - self-contained **HTML** (everything escaped, no external assets, strict CSP meta);
  - **Markdown** (PR comment / job summary);
  - **SARIF 2.1.0**, located in the head spec via the IR source map;
  - JUnit XML.
- **Exit codes:** `0` pass · `1` gate failed · `2` usage/config/invalid spec · `3` internal error.

## 5. Ownership

| Role | Person            | Area                                         |
| ---- | ----------------- | -------------------------------------------- |
| P1   | Prathamesh Yewale | Frontend & UI                                |
| P2   | Yug Vyas          | Auth & application logic (and security lead) |
| P3   | Tanishq Chavan    | Database & backend                           |
| P4   | Pruthvi Gangapure | Pipeline/CI-CD & testing                     |

| Module                                                            | Owner | Reviewer |
| ----------------------------------------------------------------- | ----- | -------- |
| core: Ingest (stage 1)                                            | P3    | P4       |
| core: Diff (stage 2)                                              | P4    | P3       |
| core: Corpus (stage 3), incl. streaming and HAR                   | P3    | P2       |
| ↳ redaction module                                                | P2    | P3       |
| ↳ change-directed synthesis                                       | P4    | P3       |
| core: Verify (stage 4), incl. worker pool                         | P3    | P4       |
| core: Classify (stage 5) + `packages/rules`                       | P4    | P2       |
| core: Report & Gate (stage 6)                                     | P4    | P1       |
| ↳ HTML report template                                            | P1    | P4       |
| `packages/report-schema`                                          | P4    | P1, P3   |
| `packages/cli`                                                    | P4    | P3       |
| `packages/github-action` + GitHub App (M8)                        | P4    | P2       |
| `packages/db`, ingestion API, object storage                      | P3    | P2       |
| `apps/worker`, queue, SSE, observability                          | P3    | P4       |
| Auth, middleware, RBAC, orgs/invites, API keys, audit log         | P2    | P3       |
| `apps/web` UI, design system, accessibility                       | P1    | P2       |
| CI pipeline, `packages/bench`, EVALUATION.md                      | P4    | P3       |
| `docs/SECURITY.md` threat model, env validation, dependency audit | P2    | all      |
| `infra/` docker-compose, Dockerfiles                              | P3    | P4       |

Each owner writes `docs/modules/<package>.md`: purpose, public API, data flow, decisions, limitations, and "questions an examiner might ask" with answers.

## 6. Milestones

Every milestone ends with: CI green (`pnpm turbo run typecheck lint test build`), coverage thresholds held (core and rules ≥ 90%, overall ≥ 80%), module docs updated, INVENTORY's SIMULATED register updated, and a summary posted (CLAUDE.md "End of every milestone"). Then we stop for review.

Effort is sized relative to M1 (M1 = 1.0) until we have dates (Q2).

### M0 — Foundations (size 0.5)

Owners: P4 (CI, tooling), P3 (docker-compose), P2 (env validation, secrets hygiene, SECURITY.md outline), P1 (`apps/web` shell with ported design tokens).

- Legacy handling per Q3: tag the legacy snapshot and take the legacy app out of product paths. **Before anything is committed, the hardcoded Groq key is removed and rotated (Q4).**
- pnpm workspaces + Turborepo. Node LTS pinned (`.nvmrc`, `engines`, `packageManager`). TS strict base config, ESLint flat config, Prettier, Husky + lint-staged + commitlint, Changesets.
- All packages and apps scaffolded with real (if tiny) code and tests. No stub features.
- Root Vitest in projects mode with v8 coverage and per-glob thresholds.
- `infra/docker-compose.yml`: Postgres, Redis and an S3-compatible store, all with healthchecks (R8).
- Env validation with zod in `web` and `worker` that **fails fast in every environment**.
- CI: install → typecheck → lint → test with coverage → build → `pnpm audit --prod`. It runs on PRs and on the default branch (Q5).
- Doc skeletons: `ARCHITECTURE.md`, `SECURITY.md` (threat model outline), `docs/modules/*.md` headings.
- **Acceptance:**
  - fresh clone → `pnpm install && pnpm turbo run typecheck lint test build` is green locally and in CI;
  - `docker compose -f infra/docker-compose.yml up -d` reports all services healthy;
  - `pnpm --filter @drift/web dev` serves a landing page with the DRIFT visual identity and **no fake numbers or claims**;
  - starting `web` with a missing required env var exits with a readable zod error;
  - CLAUDE.md "Commands" is updated to the real scripts.

- **Status: complete, awaiting review (2026-09-26),** on branch `rebuild/m0-foundations`. Deviations from the text above, all deliberate:
  - `packages/db`, `github-action` and `bench` are README-only directories stating their milestone. There is no real code to scaffold yet. They also have no `package.json`: pnpm 12.6 never writes a lockfile entry for a dependency-free workspace package, yet `--frozen-lockfile` requires one, so an empty package breaks CI installs.
  - Vitest uses per-package configs and thresholds instead of root projects mode. This keeps Turborepo's per-package caching, and per-package ≥ 80% implies overall ≥ 80% (see `docs/modules/tooling.md`).
  - "Fresh clone" needs one extra step: `cp apps/web/.env.example apps/web/.env.local`. That is the fail-fast env validation working as intended; CI sets `APP_URL` itself.
  - The Groq key was removed before any commit, but **rotating it is an owner action still open** (SECURITY.md incident log).

### M1 — Core: Ingest + IR + Diff (size 1.0)

Owners: P3 (Ingest), P4 (Diff, report-schema change types).

- Everything in §4.1–4.2.
- `packages/bench/scripts/fetch-fixtures`: downloads the GitHub `rest-api-description` and Stripe `openapi` specs at **pinned commit SHAs**, after licence verification (Q9). Fixtures are downloaded, not vendored.
- Parser/bundler spike on those fixtures. ADR-0003 moves from Proposed to Accepted, citing bench output.
- Early CLI commands so the milestone is demoable: `drift validate <spec>` and `drift diff --base --head --format json`.
- Tests:
  - unit tests for each normaliser rule and each change kind (fixture pairs in `examples/`);
  - property-based tests (fast-check): `diff(a, a) = ∅`; change ids stable under key reordering; normalisation idempotent; output deterministic;
  - fuzz tests: ingest never throws an uncaught error on random YAML;
  - security tests: remote ref refused, `../` escape refused, alias bomb refused, oversize refused.
- **Acceptance:**
  - `drift validate examples/invalid/*.yaml` prints `file:line:col` errors and exits 2;
  - `drift diff` on every golden pair matches the golden change set;
  - both large fixtures ingest, and self-diff yields zero changes;
  - core coverage ≥ 90%.

### M2 — Core: Corpus + Verify + Classify + rules (size 1.3)

Owners: P3 (Corpus, Verify), P4 (rules, Classify, report-schema v1), P2 (redaction), P4 (synthesis).

- Everything in §4.3–4.5.
- `drift-traffic/v1` JSON Schema and docs, HAR import, and `drift-report/v1` finalised (zod → generated JSON Schema, committed).
- The engine emits the JSON report end to end.
- **Acceptance:**
  - `drift compare --base examples/petstore/v1.yaml --head examples/petstore/v2-breaking.yaml --traffic examples/petstore/traffic.jsonl --format json` reports a BREAKING change with a redacted failing payload;
  - the same command without `--traffic` reports synthetic evidence, flagged as synthetic;
  - property test: a structurally dangerous change with zero failing samples is **never** SAFE;
  - redaction canary test: secrets planted in the test corpus appear in **no** output or artifact;
  - validators compile once per cache key (asserted by a counter);
  - rules coverage ≥ 90%.

### M3 — CLI + all report formats + exit codes + first bench run (size 0.9)

Owners: P4 (CLI, formats, bench), P1 (HTML template).

- Full CLI surface:
  - `compare` (`--traffic`, `--rules`, `--policy`, `--format`, `--out`, `--fail-on`);
  - `validate`, `corpus inspect`, `rules list`, `explain <change-id>`;
  - `--base origin/main:openapi.yaml` (via `git show`, no dependency);
  - `drift.config.{json,yaml}` with a published JSON Schema.
- All six formats with **golden-file tests**. Exit codes are documented and tested.
- Local stage cache in `.drift/cache/`, so a re-run with unchanged inputs reports cache hits.
- `packages/bench`: perf harness on the large fixtures and on synthetic corpora of growing size (memory sampled). Writes machine-readable results and regenerates `docs/EVALUATION.md`. CI fails if the committed EVALUATION.md differs from a regeneration.
- The mutation generator starts here, DRIFT-only (Q10).
- **Acceptance:**
  - `pnpm --filter @drift/cli exec drift compare --base examples/petstore/v1.yaml --head examples/petstore/v2-breaking.yaml --format console,json,html,md,sarif --out out/` exits 1 and writes five valid files. SARIF is validated against its schema; HTML contains no external URL.
  - `pnpm --filter @drift/bench run perf` produces results and EVALUATION.md.

### M4 — GitHub Action + dogfooding (size 0.6)

Owners: P4 (Action), P2 (permissions review), P3 (DRIFT API spec with P2).

- `action.yml` on the current Node runtime, bundled with esbuild. It:
  - writes the Markdown report to `$GITHUB_STEP_SUMMARY`;
  - posts or updates **one** PR comment (found by a hidden marker);
  - optionally uploads SARIF;
  - optionally uploads to the platform (no-op until M5, clearly documented);
  - fails per `fail-on`.
- Least-privilege `permissions:` are documented, along with the **branch-protection "required status check"** needed to actually block merges.
- **Dogfooding, spec-first:** `apps/web/openapi/drift-api.yaml` is written now, as the design of the M5 ingestion API. DRIFT's own CI runs DRIFT on it for every PR. In M5, contract tests validate the real handlers' requests and responses against this spec using core's own validators.
- Sample repository for the stranger demo (Q8).
- **Acceptance:**
  - a PR in the sample repo that removes a request enum value fails the check, and its comment shows the rule, rationale and failing payload;
  - an additive PR passes;
  - DRIFT's CI shows the dogfood job.

### M5 — DB, auth, orgs/RBAC, API keys, ingestion API, object storage (size 1.3)

Owners: P3 (db, ingestion API, storage), P2 (auth, RBAC, invitations, API keys, audit log), P1 (auth screens, minimal run list).

- **Data model**, refining the legacy schema:
  - User, Account, Session, Organization, Membership (OWNER/ADMIN/MEMBER/VIEWER), Invitation (hashed token, expiry);
  - Project (org, slug, repo binding, spec path);
  - ApiKey (org, optional project, name, display prefix, SHA-256 hash, permissions, `lastUsedAt`, `revokedAt`, `expiresAt?`);
  - Run (status, trigger, idempotency key, commit, PR, base/head spec hashes, engine/rules/policy versions, gate result, counts, semver, error category, parent run for re-runs, timings);
  - StageExecution (stage, attempt, status, cacheKey, cacheHit, timings, metrics, output/log artifact refs);
  - Artifact (org-scoped SHA-256 key, kind, size, content type);
  - Change, Evidence (summary + artifact ref to redacted payloads), Policy, Suppression, AuditLog (append-only, org, actor user/key, action, target, metadata), WebhookDelivery.
- **Auth** (library per ADR-0007 / Q7): credentials (bcrypt) + GitHub OAuth.
  - Middleware protects `/dashboard/**` and `/settings/**`.
  - **Every API route goes through one `requireAuth({ permission })` helper**, which checks a session or API key and resolves the org. Roles are read from the DB on every request, never trusted from a token.
  - No dev login fallback exists in any build.
- **API keys:** `crypto.randomBytes`, prefix `drift_`, shown once, stored as SHA-256, scoped, revocable.
- **Ingestion:** `POST /api/v1/runs` takes an `Idempotency-Key`, validates the report with zod against `drift-report/v1`, enforces strict body limits, and returns pre-signed PUT URLs for artifacts. Then `POST /api/v1/runs/{id}/complete`. Artifacts are read back through short-lived signed GET URLs.
- `drift compare --upload` works with `DRIFT_API_KEY`.
- **Acceptance** (Playwright + Testcontainers integration):
  - the flow register → create org → create project → create key (shown once) → `drift compare --upload` → run visible via the API and a minimal run list;
  - cross-org access returns 404;
  - VIEWER cannot create keys (403);
  - a revoked key gets 401;
  - repeating an upload with the same idempotency key returns the same run;
  - oversize and invalid reports are rejected;
  - audit entries exist for key create/revoke, membership change and suppression create;
  - contract tests pass against `drift-api.yaml`.

### M6 — Worker/queue, SSE live runs, stage re-runs, observability (size 1.1)

Owners: P3 (worker, queue, SSE, observability), P4 (stage re-run API in core), P1 (minimal live run view).

- **Queue.** BullMQ with retries, exponential backoff, a dead-letter queue, job timeouts, and **per-org concurrency via a Redis semaphore** (BullMQ's group feature is Pro-only; R9). The worker runs core stages in a piscina pool.
- **Server-side runs.** Runs from uploaded specs and corpus. **Re-run a stage** with a new corpus, rules or policy creates a child run whose unchanged upstream stages are cache hits.
- **SSE** `GET /api/v1/runs/{id}/events`: live events via Redis pub/sub, catch-up from a per-run Redis Stream, and resume with `Last-Event-ID` (ADR-0004).
- **Rate limiting** in Redis.
- **Observability.** pino JSON logs with request and run ids (secrets and PII redacted by a logger serializer). OpenTelemetry traces web → queue (context in job data) → worker → each stage, viewable in local Jaeger. `/healthz` (liveness) and `/readyz` (DB + Redis + storage).
- **Acceptance:**
  - `curl -N` on the events endpoint streams stage events live;
  - reconnecting with `Last-Event-ID` replays only the missed events;
  - killing the worker mid-run → the job is retried and the run completes;
  - re-running Verify with a new corpus shows Ingest and Diff as `cacheHit: true`;
  - one trace spans web → worker → all six stages;
  - `/readyz` goes non-ready when Redis is stopped.

### M7 — Web UI (size 1.2)

Owners: P1 (screens, design system, a11y), P2 (settings, keys, members, audit screens).

- **Screens:**
  - org/project overview;
  - run list with filters;
  - **run canvas** (6 live stages via SSE, inspector with the real inputs/outputs/logs/timings/artifacts/evidence, re-run stage button);
  - side-by-side contract diff;
  - change detail with evidence and rule rationale;
  - policies and suppressions;
  - API keys, members/invitations, audit log;
  - project setup wizard that generates the GitHub Action YAML.
- The 3D hero appears on the marketing page only. Marketing copy is rewritten without unverifiable claims (Q11).
- Optional **DEMO** mode (Q12) is labelled "DEMO" in the UI and seeded only from real CLI output on `examples/`.
- **Acceptance:**
  - Playwright e2e covers login, create project, upload run, view canvas, re-run stage;
  - axe checks pass (no serious or critical issues) on key screens;
  - a CI grep/lint guard finds no module-level data arrays in `apps/web/app/(product)/**`.

### M8 — GitHub App, full mutation benchmark vs oasdiff, perf benchmark, EVALUATION.md (size 1.3)

Owners: P4 (App, bench), P3 (webhook → queue plumbing), P2 (App permissions, webhook security).

- **App.**
  - `X-Hub-Signature-256` is verified over the raw body in constant time;
  - handles `pull_request` opened/synchronize/reopened;
  - `WebhookDelivery` gives redelivery idempotency, and out-of-order events are ignored when an older head SHA arrives after a newer one;
  - the worker fetches the specs with an installation token (least privilege: contents read, checks write, pull-requests write);
  - Check Run with annotations.
- **Mutation benchmark.**
  - seeded, labelled mutations on several real specs: breaking (request enum value removed, bound tightened, type changed, required request field added, endpoint or status removed, response enum value added) and safe (optional field added, endpoint added, description edited, bound relaxed);
  - traffic generated for each;
  - DRIFT and **oasdiff** (Docker image pinned by digest) run on identical inputs;
  - **the mapping of oasdiff levels to our labels is committed before the first run**;
  - reports precision/recall/F1 for BREAKING, false-positive rate on safe mutations, RISKY rate, and runtime.
- **Perf benchmark:**
  - largest-fixture compare time;
  - ≥ 1M JSONL samples verified under a memory ceiling fixed in the bench config at M3;
  - scaling with corpus size;
  - cached re-run time.
- **Acceptance:**
  - `pnpm --filter @drift/bench run all` reproduces `docs/EVALUATION.md` from seed;
  - the App blocks a breaking PR on the sample repo via a Check Run;
  - the project definition of done (MASTER_PROMPT, end) is met.

### Stretch (only after M8 is green)

Consumer blast radius (affected `clientId`s), migration guide in the PR comment, suggested non-breaking alternative, production drift monitoring, optional LLM explainer (grounded only in stored evidence, off by default, never decides severity).

### Cut line if time runs short

We protect M0–M4 plus the mutation benchmark first. That alone satisfies "block a breaking PR with evidence" and "reproducible accuracy vs a baseline". M5–M7 deliver the deck's canvas, real-time and multi-tenancy objectives. M8's App mode is the first thing to drop.

## 7. Parallel work (proposal — Q6)

Milestones merge in order, but people work ahead on branches so nobody idles while the engine is built:

- **P1 during M1–M4:** web shell and design system, a marketing page rewrite without false claims, the HTML report template (M3), and canvas/diff components built against real `drift-report/v1` JSON produced by the CLI from `examples/`.
- **P2 during M1–M4:** SECURITY.md threat model, ingest limit tests, the redaction module (M2), the auth/RBAC schema and `requireAuth` design (merged in M5), and the Action permissions review (M4).

## 8. Dependencies

Versions are **checked and pinned at install time** in the milestone that introduces them; none are remembered here. Each added dependency needs a one-line reason.

**Pinned in M0** (reasons for the non-obvious choices are in `docs/modules/tooling.md`):

- Node 24 LTS; pnpm 12.6.0; Turborepo 2.11.4.
- TypeScript **6.0.3**, not 7: TS 7 has no classic compiler API, which typescript-eslint and Next.js need.
- ESLint **9.39.5**, not 10: eslint-config-next's React and jsx-a11y plugins do not support 10 yet.
- Vitest 5.0.2, fast-check 4.10.2, zod 4.6.5, commander 15.0.0.
- Next.js 16.3.6, React 19.3.0, Tailwind 4.3.3.
- ioredis 6.0.0 and pino 10.3.1 (brought forward from M6 for the worker's Redis readiness check and structured logs).
- Postgres 18, Redis 8.8, **SeaweedFS 4.47 instead of MinIO** (risk R8 materialised).

| Dependency                                                                                  | Where                             | Why                                                                                                                                |
| ------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| pnpm, Turborepo                                                                             | root                              | Workspaces plus cached, ordered task graph (MASTER_PROMPT §3).                                                                     |
| TypeScript, ESLint (+typescript-eslint), Prettier                                           | root                              | Strict typing and consistent style.                                                                                                |
| Vitest + @vitest/coverage-v8, fast-check                                                    | root                              | Unit, property-based tests and coverage thresholds per package glob.                                                               |
| Husky, lint-staged, commitlint, Changesets                                                  | root                              | Pre-commit checks, Conventional Commits, versioning of CLI/Action.                                                                 |
| `yaml`                                                                                      | core                              | YAML 1.2 parser with source positions and alias limits (needed for located errors and DoS limits).                                 |
| `ajv`, `ajv-formats`, `ajv-draft-04`                                                        | core                              | JSON Schema validation: 2020-12 for OAS 3.1 and payloads; draft-04 only to validate 3.0 documents against the official 3.0 schema. |
| `$ref` bundler (ADR-0003: `@apidevtools/json-schema-ref-parser` or `@redocly/openapi-core`) | core                              | Bundling external refs with a controllable resolver. Chosen by the M1 spike.                                                       |
| piscina                                                                                     | core/worker                       | Mature `worker_threads` pool for CPU-bound validation.                                                                             |
| zod                                                                                         | report-schema, rules, web, worker | Runtime validation; zod v4 also generates the committed JSON Schema.                                                               |
| commander, picocolors                                                                       | cli                               | Argument parsing; tiny colour library that respects `NO_COLOR`.                                                                    |
| @actions/core, @actions/github, esbuild                                                     | github-action                     | Official Action toolkit; single-file bundle required by JS Actions.                                                                |
| Prisma (+ Postgres driver adapter if required by the pinned major)                          | db                                | Schema, migrations, typed client (the team already knows it).                                                                      |
| Auth library (ADR-0007)                                                                     | web                               | Sessions, OAuth, credentials.                                                                                                      |
| bcryptjs                                                                                    | web                               | Password hashing (pure JS, already used; cost ≥ 12).                                                                               |
| bullmq, ioredis                                                                             | worker, web                       | Queue with retries/backoff/DLQ; Redis client for pub/sub, streams, semaphores.                                                     |
| rate-limiter-flexible                                                                       | web                               | Redis-backed rate limiting (replaces the in-memory map).                                                                           |
| @aws-sdk/client-s3, @aws-sdk/s3-request-presigner                                           | web, worker                       | S3-compatible storage and signed URLs (works with MinIO/R2/S3).                                                                    |
| pino, @opentelemetry/*                                                                      | web, worker                       | Structured logs and distributed traces.                                                                                            |
| Next.js, React, Tailwind, Radix, Motion, React Three Fiber/drei/three                       | web                               | Existing stack and visual identity (3D on the marketing page only).                                                                |
| testcontainers (+ postgres/redis/minio modules), @playwright/test, @axe-core/playwright     | tests                             | Real services in integration tests; e2e and accessibility checks.                                                                  |
| oasdiff (Docker image, pinned digest)                                                       | bench only                        | The baseline tool for comparison; never a runtime dependency.                                                                      |
| Jaeger all-in-one (container)                                                               | infra (dev)                       | Local trace viewer for the OTel acceptance check.                                                                                  |

## 9. Risks

| #   | Risk                                                                                                                         | Likelihood / impact | Mitigation                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Scope: 9 milestones, 4 students, one semester                                                                                | High / High         | Cut line (§6), parallel tracks (§7), milestone sizes re-estimated after M1 with real velocity.                                                                                                                                                                          |
| R2  | Leaked Groq API key (INVENTORY §5)                                                                                           | Present / High      | Rotate now. Remove the literal before any commit. Add secret scanning (e.g. gitleaks) to pre-commit and CI in M0.                                                                                                                                                       |
| R3  | Real-world specs (GitHub, Stripe) hit parser edge cases or are slow                                                          | Medium / High       | M1 spike on those fixtures; located errors; fuzz and property tests; ingest performance measured by bench, not asserted.                                                                                                                                                |
| R4  | `allOf` merging or 3.0→JSON Schema conversion is subtly wrong, giving false BREAKING                                         | Medium / High       | Merge only when provably safe; otherwise keep `allOf`. Every normaliser rule has unit tests. The mutation benchmark measures false positives.                                                                                                                           |
| R5  | ajv compile cost on specs with thousands of schemas                                                                          | Medium / Medium     | Compile lazily, only for affected operations; cache per key; measured in bench.                                                                                                                                                                                         |
| R6  | Redaction changes values so validation fails (false BREAKING)                                                                | Medium / High       | Record redacted pointers; errors at redacted pointers count as "unknown", never as failure. Dedicated tests.                                                                                                                                                            |
| R7  | Synthetic evidence is over-trusted                                                                                           | Medium / Medium     | `synthetic: true` everywhere; lower confidence (ADR-0002); reports state it prominently; bench reports recorded vs synthetic separately.                                                                                                                                |
| R8  | MinIO's community distribution changed in 2025 (pre-built images may no longer be published or updated)                      | **Occurred** / Low  | **Confirmed at M0:** the `minio/minio` Docker Hub repository returns 404 and the GitHub repository is archived. Replaced by SeaweedFS (Apache-2.0, maintained) behind the S3 API. Testcontainers' MinIO module cannot be used in M5; use a generic SeaweedFS container. |
| R9  | BullMQ per-group concurrency is a Pro feature                                                                                | Known / Medium      | Per-org concurrency with a Redis counting semaphore and delayed retry; integration-tested.                                                                                                                                                                              |
| R10 | Auth.js v5 has stayed in beta; v4 is in maintenance                                                                          | Known / Medium      | ADR-0007 decides (Q7). Authorization (org, role) is our own code either way, so the auth library only handles identity.                                                                                                                                                 |
| R11 | Serverless hosting limits SSE duration and cannot run the worker                                                             | Medium / Medium     | Definition of done is `docker compose` locally. SSE clients auto-reconnect with `Last-Event-ID`. The hosting decision is Q13.                                                                                                                                           |
| R12 | oasdiff comparison seen as unfair                                                                                            | Medium / Medium     | Level mapping committed before the first run; identical inputs; generator, seed and scripts committed so anyone can reproduce.                                                                                                                                          |
| R13 | Toolchain drift: local Node 26 vs LTS; `node_modules` from another architecture; corepack no longer bundled with recent Node | Known / Low         | Pin Node LTS in `.nvmrc`/`engines`/CI; pin pnpm via `packageManager`; install pnpm explicitly in docs and CI.                                                                                                                                                           |
| R14 | Repo is owned by a teammate's account; branch protection, Actions secrets and App registration need owner rights             | Known / Medium      | Q5/Q8: agree who administers the repo, or move to a GitHub organisation.                                                                                                                                                                                                |
| R15 | Big-bang rewrite removes the demo that exists today                                                                          | Medium / Low        | Tag the legacy snapshot (Q3). It stays reachable from the tag, but not from product paths.                                                                                                                                                                              |

## 10. Decisions (approved 2026-09-26)

| #   | Question                                  | Decision                                                                                                                                                     | Follow-up                                                                                                         |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Q1  | Who is P1–P4?                             | P1 Prathamesh Yewale · P2 Yug Vyas · P3 Tanishq Chavan · P4 Pruthvi Gangapure.                                                                               | —                                                                                                                 |
| Q2  | Final evaluation date(s), hours per week? | Not yet given; milestones stay sized relative to M1.                                                                                                         | Re-estimate after M1 with real velocity.                                                                          |
| Q3  | Legacy app handling                       | Key literal removed, snapshot committed (`chore: snapshot legacy app before rebuild`), tagged **`legacy-v1`**. M0 removes the legacy app from product paths. | Done in M0.                                                                                                       |
| Q4  | Groq key rotation / live deployment       | Rotate the key; disable the demo fallback on `driftapi.vercel.app` or take it down until M7.                                                                 | **Owner action (P2 + repo owner): rotate the key in the Groq console; it is also in the untracked local `.env`.** |
| Q5  | Default branch                            | Keep `master`; CI triggers fixed in M0; branch protection with required checks.                                                                              | Repo owner (P2, `Yugvyas10`) enables branch protection after M0 merges.                                           |
| Q6  | Parallel tracks (§7)                      | Approved.                                                                                                                                                    | —                                                                                                                 |
| Q7  | Auth library                              | **next-auth v4** (ADR-0007 Accepted).                                                                                                                        | —                                                                                                                 |
| Q8  | Sample repo location                      | A GitHub organisation for the team.                                                                                                                          | Needed by M4.                                                                                                     |
| Q9  | Download GitHub/Stripe specs by script    | Approved; licences verified and recorded at M1.                                                                                                              | M1.                                                                                                               |
| Q10 | Mutation generator from M3                | Approved.                                                                                                                                                    | M3.                                                                                                               |
| Q11 | Marketing pages                           | Keep landing, docs, about; drop pricing, enterprise, blog, testimonials, stats.                                                                              | M0 landing; docs/about in M7.                                                                                     |
| Q12 | DEMO mode                                 | Allowed, labelled "DEMO", seeded only from real CLI output on `examples/`.                                                                                   | M7.                                                                                                               |
| Q13 | Public deployment                         | Local `docker compose` is enough for the definition of done; hosting decided by M6.                                                                          | M6.                                                                                                               |
| Q14 | AI chat assistant                         | Removed in M0 with the legacy app; revisit as the stretch "grounded explainer".                                                                              | —                                                                                                                 |

## 11. Architecture Decision Records

| ADR                                                    | Title                                             | Status                                      |
| ------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------- |
| [0001](adr/0001-monorepo-and-rebuild-strategy.md)      | Monorepo with pnpm + Turborepo; rebuild in place  | Accepted                                    |
| [0002](adr/0002-evidence-based-classification.md)      | Evidence-based classification and confidence      | Accepted (confidence formula amended in M2) |
| [0003](adr/0003-openapi-parsing-and-ref-resolution.md) | OpenAPI parsing, validation and `$ref` resolution | Proposed (confirm by M1 spike)              |
| [0004](adr/0004-sse-over-websockets.md)                | Server-Sent Events instead of WebSockets          | Accepted                                    |
| [0005](adr/0005-rules-as-data.md)                      | Classification rules as versioned data            | Accepted                                    |
| [0006](adr/0006-content-addressed-stage-outputs.md)    | Typed, content-addressed stage outputs            | Accepted                                    |
| [0007](adr/0007-auth-library.md)                       | Authentication library (next-auth v4)             | Accepted                                    |
