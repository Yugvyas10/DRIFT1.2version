# MASTER PROMPT — DRIFT: Industry-Grade Reconstruction

You are the lead engineer rebuilding **DRIFT**, an API contract compatibility gate for CI/CD, from the ground up. The previous version was a polished web UI running on simulated data, and reviewers called it "vibe coded" and "wouldn't work for large projects." Your job is to make both criticisms impossible: every feature real, every claim measured, every module explainable by the student who owns it.

Read this whole prompt before doing anything. Then follow **Section 13 (How to work)** exactly — it starts with a plan, not code.

---

## 1. Reference material

- `docs/reference/Drift_Platform_Review.pptx` — the team's mid-semester deck. Extract its text with `markitdown` or `python-pptx`. Use it for **branding, the 6-stage pipeline concept, the six objectives (slide 8), the team structure and visual tone**. It is **not** a spec where it conflicts with this prompt. Known problems in the deck, to ignore:
  - It frames DRIFT as a generic CI/CD pipeline visualiser. This prompt resolves that (Section 2).
  - The "50% complete" list on slide 12 overstates what existed.
  - Slides 2–5 carry a wrong DOI; slide 3 has leftover text from an unrelated EEG project.
- If an existing DRIFT repository is present (a Next.js app, and possibly a separate `drift-api-main` CLI), **inventory it first** (Section 13, step 1). Reuse the visual design language and any genuinely working engine code. Do not reuse fake data, simulated timers, placeholder middleware or hardcoded arrays in product paths.

---

## 2. Product definition (non-negotiable)

**One sentence:** DRIFT runs inside a CI pipeline, compares the old and new OpenAPI contract of a REST API, proves with evidence whether the change would break real consumers, and blocks the merge if it would.

**Positioning:**

- Structural diff tools (e.g. oasdiff, openapi-diff) already detect changes and can fail a pipeline. Their own "warning" class covers changes that cannot be confirmed programmatically.
- DRIFT's contribution is **evidence**: a change is labelled **BREAKING** only when concrete samples fail against the new contract. Otherwise it is **RISKY** (structurally dangerous, not yet proven) or **SAFE**. Every label carries its rule, rationale and, where applicable, the failing payload.
- DRIFT is a check that runs _inside_ GitHub Actions and other CI systems. It does not replace them.

**How the deck's six objectives are satisfied under this framing:**

| Deck objective (slide 8)          | What it becomes                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Interactive canvas, 6 stages   | Live canvas of a _real_ DRIFT analysis run: Ingest → Diff → Corpus → Verify → Classify → Report & Gate                                                             |
| 2. Context-aware inspector        | Per-stage inputs, outputs, logs, timings, artifacts and evidence — all from the real run                                                                           |
| 3. Replay engine (re-run a stage) | Stage outputs are content-addressed and persisted, so any stage can be re-run with changed inputs (new corpus, new rules, new policy) without restarting the run   |
| 4. Smart classification           | BREAKING / RISKY / SAFE with rule id, confidence and evidence; plus a cause category when a _run_ fails (invalid spec = config, storage unreachable = infra, etc.) |
| 5. Real-time state                | Server-Sent Events fed by Redis pub/sub (document why SSE instead of WebSockets: works on serverless hosts, auto-reconnect with `Last-Event-ID`)                   |
| 6. Secure multi-tenancy           | Org-scoped data, RBAC, scoped API keys, audit log                                                                                                                  |

**Explicit non-goals (do not build):** generic CI log analysis for arbitrary build failures, billing/payments, Kubernetes/Helm, microservices beyond `web` + `worker`, GraphQL/gRPC/SOAP/AsyncAPI support (design ingestion so they could be added later as adapters), ML classification in the core path.

---

## 3. Architecture

A **pnpm workspaces + Turborepo** monorepo, TypeScript `strict` everywhere, Node LTS. Check current stable versions of every dependency at install time and pin them; do not rely on remembered version numbers.

```
drift/
├─ packages/
│  ├─ core/            # Pure engine. No network, no DB. File/stream access only via injected adapters.
│  ├─ report-schema/   # Versioned JSON Schema + zod types for "drift-report/v1" (the contract between everything)
│  ├─ rules/           # Default classification rules table (versioned data + loader + validation)
│  ├─ cli/             # `drift` binary built on core
│  ├─ github-action/   # GitHub Action wrapping the CLI
│  ├─ db/              # Prisma schema, migrations, client, seed
│  └─ bench/           # Evaluation harness (mutation benchmark, perf benchmark)
├─ apps/
│  ├─ web/             # Next.js App Router: dashboard + REST API (BFF)
│  └─ worker/          # BullMQ consumer running the engine in a worker_threads pool
├─ infra/              # docker-compose (Postgres, Redis, MinIO), Dockerfiles
└─ docs/               # PLAN.md, ARCHITECTURE.md, adr/, modules/, EVALUATION.md, SECURITY.md
```

**Core rule:** `packages/core` must be usable standalone (CLI, Action, worker and tests all call the same functions). The web app never re-implements engine logic.

**Data flow (platform mode):**
CLI/Action runs in the customer's CI → uploads a `drift-report/v1` + stage artifacts via the ingestion API (API key) → web stores metadata in Postgres, artifacts in S3-compatible storage → dashboard renders the run. Optional **App mode** (later milestone): a GitHub App webhook enqueues a job, the worker fetches specs from the repo, runs the engine, and posts a Check Run.

**Suggested stack** (deviate only with an ADR): Next.js (App Router) · Auth.js · Prisma + PostgreSQL · BullMQ + Redis · S3-compatible storage (MinIO locally, S3/R2 in prod) · Zod · ajv + ajv-formats (use the draft 2020-12 build for OpenAPI 3.1) · an OpenAPI parser/bundler such as `@apidevtools/swagger-parser` or `@redocly/openapi-core` · commander · pino · OpenTelemetry · Vitest · Playwright · Testcontainers · Tailwind + Radix · Framer Motion · React Three Fiber (hero only).

---

## 4. The engine (`packages/core`) — the heart of the project

Build this first. It must be correct, deterministic, fast and heavily tested before any UI work.

### Stage 1 — Ingest

- Load OpenAPI **3.0.x and 3.1.x**, YAML or JSON. Validate against the spec schema; report precise, located errors.
- Bundle and resolve `$ref`. **Internal refs always; local-file refs only inside an allowlisted root; remote HTTP refs disabled by default** (security). Handle circular refs without infinite recursion (keep refs, don't blindly fully dereference).
- Normalise into an **intermediate representation (IR)**:
  - Operation key = HTTP method + path template with **parameter names normalised** (`/users/{id}` ≡ `/users/{userId}`).
  - Parameters (path/query/header/cookie), request bodies and responses per status code **and** per media type.
  - Schemas normalised: 3.0 `nullable` → 3.1 type arrays; safe `allOf` merging; `discriminator`/`oneOf` preserved.
- Content-hash every normalised spec; the hash keys all caches.

### Stage 2 — Structural diff

- Diff the two IRs into **Change records** with a stable id (hash of kind + location), `kind`, JSON-pointer `location`, **`direction` (request | response)**, `before`, `after`, and a structural `candidateSeverity`.
- Cover at least these kinds: endpoint added/removed; method removed; path param renamed vs. changed; parameter added (required/optional), removed, made required, location changed; request body required-ness; property added/removed/made required/made optional; type changed; format changed; enum value added/removed; numeric/length/pattern bounds tightened/relaxed; `additionalProperties` tightened; status code added/removed; media type added/removed; default changed; deprecation added; security requirement changed.
- **Direction matters and must be explicit in the rules:** narrowing what a server _accepts_ (request) breaks clients; widening what a server _returns_ (response — e.g. a new enum value) can break clients that validate strictly. Encode both.
- Build an **impact index**: operation → changes, so later stages only touch affected operations.

### Stage 3 — Corpus

- Define and document a **JSONL traffic format** (method, path, query, headers, request body, status, response headers/body, timestamp, optional client id). Also import **HAR**.
- **Stream** input line by line with bounded memory and backpressure. Malformed lines are counted and reported, never fatal.
- **Redaction before anything is stored or reported:** `Authorization`, cookies, configurable header/body-field denylist, and pattern-based detection (emails, tokens). Redaction is on by default.
- **Synthetic generation** from the _old_ contract when no traffic is supplied: deterministic (seeded), covering required fields, enum values, boundary values. Every synthetic sample is tagged `synthetic: true`, and reports must say so prominently.

### Stage 4 — Verify (the evidence engine)

- **Request direction:** validate each recorded/synthetic request (params + body) against the **new** request contract. A failure is evidence that the new server would reject existing clients → candidate BREAKING with the exact payload.
- **Response direction:** generate seeded samples from the **new** response schema and validate them against the **old** response schema. A failure is evidence that clients built against the old contract may reject the new responses. Also validate recorded responses against the new schema and report non-conformance as informational.
- Only verify samples that hit operations in the impact index.
- **Compile ajv validators once** per (spec hash, operation, direction, status, media type) and cache them. Run validation in a **worker_threads pool** for large corpora. Output: per-change evidence counts (samples checked, failed, first N failing payloads, redacted).
- Support stratified sampling with a configurable cap for huge corpora and report coverage honestly (e.g. "checked 50,000 of 2.1M samples, 100% of affected operations").

### Stage 5 — Classify

- Rules live in `packages/rules` as **versioned, validated data** (not code scattered across the engine). Each rule: id, change kind, direction, condition on evidence, resulting severity, rationale text.
- Core policy: **BREAKING requires failing evidence**; structurally dangerous changes without failing evidence are **RISKY** (never auto-SAFE for lack of samples); everything else **SAFE**. Output a confidence value derived from evidence coverage, and document the formula.
- Per-project policy overrides (e.g. treat deprecations as RISKY) and **suppressions** that require a reason and an expiry date, and are written to the audit log.
- Produce a **semver recommendation** (major/minor/patch) from the classified set.

### Stage 6 — Report & Gate

- Formats: colourised console, **JSON (`drift-report/v1`, schema-validated)**, self-contained **HTML** (all content HTML-escaped, no external assets), **Markdown** (PR comment / job summary), **SARIF** (so findings appear in GitHub code scanning), JUnit XML (optional).
- Exit codes: `0` pass, `1` gate failed (`--fail-on breaking|risky`, default `breaking`), `2` usage/config/invalid spec, `3` internal error. Document them.

### Stage outputs and re-runs

Every stage writes a typed, content-addressed output (hash of inputs + engine version + rules version). This gives caching and enables the deck's "replay a stage": re-running Verify with a new corpus reuses Ingest and Diff outputs.

---

## 5. CLI (`packages/cli`)

- `drift compare --base <file|git-ref:path> --head <file> [--traffic <jsonl|har>] [--rules <file>] [--policy <file>] [--format console,json,html,md,sarif] [--out <dir>] [--fail-on breaking|risky] [--upload] [--project <id>]`
- `drift validate <spec>`, `drift corpus inspect <file>`, `drift rules list`, `drift explain <change-id>`.
- `--base origin/main:openapi.yaml` reads the base spec straight from git.
- Config file (`drift.config.{json,yaml}`) with a published JSON Schema.
- `--upload` sends the report + artifacts to the platform using `DRIFT_API_KEY`.

---

## 6. GitHub integration (`packages/github-action`, later App mode)

**Action (build first):** runs the CLI, writes the Markdown report to `$GITHUB_STEP_SUMMARY`, posts or updates a single PR comment, optionally uploads SARIF, optionally uploads to the platform, and fails the job per `fail-on`. Document the branch-protection "required status check" setting needed to actually block merges.

**App (later milestone):** webhook endpoint verifies `X-Hub-Signature-256` with HMAC-SHA256 over the **raw body** and a constant-time comparison; handles `pull_request` opened/synchronize/reopened; enqueues a job; the worker fetches both spec versions, runs the engine, and creates a Check Run with annotations. Idempotency key = repo + PR + head SHA + spec hashes. Handle redelivery and out-of-order events.

**Dogfooding:** DRIFT's own REST API has an OpenAPI spec, and DRIFT's own CI runs DRIFT against it on every PR.

---

## 7. Platform (`apps/web` + `apps/worker`)

- **Auth:** Auth.js with credentials (bcrypt/argon2) + GitHub OAuth. Middleware actually protects `/dashboard/**` and `/settings/**`, and every API route checks session or API key. No development-only "log in as anyone" fallback that could ever reach production.
- **Multi-tenancy:** every query scoped by organisation; roles OWNER/ADMIN/MEMBER/VIEWER enforced server-side; invitations; audit log for security-relevant actions.
- **API keys:** `crypto.randomBytes`, prefix `drift_`, shown once in plaintext, stored as SHA-256 hash, scoped (project, permissions), revocable, `lastUsedAt`.
- **Ingestion API:** `POST /api/v1/runs` (idempotent), multipart or pre-signed upload for artifacts; strict size limits; zod validation against `drift-report/v1`.
- **Data model (starting point, refine in PLAN):** User, Organization, Membership, Project (with repo binding), ApiKey, Run (status, trigger, commit, PR, spec hashes, engine/rules versions, timings), StageExecution (per stage: status, timings, metrics, artifact refs, logs ref), Change, Evidence (summary + artifact ref to redacted payloads), Suppression, Policy, AuditLog, WebhookDelivery. Artifacts in object storage with **signed URLs**; content-addressed keys.
- **Queue:** BullMQ with retries, exponential backoff, dead-letter handling, job timeouts, and per-org concurrency limits. Rate limiting in Redis (not in memory).
- **Real-time:** SSE endpoint per run, backed by Redis pub/sub, with `Last-Event-ID` resume.
- **UI:** keep the existing dark visual identity. Screens: org/project overview; run list with filters; **run canvas** (6 live stages, inspector panel, re-run stage button); side-by-side contract diff; change detail with evidence and rule rationale; policies and suppressions; API keys; audit log; project setup wizard that generates the GitHub Action YAML. The 3D hero stays on the marketing page only.
- **No fake data in product paths.** A demo mode is allowed only if it is clearly labelled "DEMO" in the UI and seeded from **real engine output** produced by running the CLI on bundled fixtures.
- **Observability:** pino structured logs with request/run ids, OpenTelemetry traces across web → queue → worker → engine stages, `/healthz` (liveness) and `/readyz` (DB + Redis + storage).

---

## 8. Scalability — prove it, don't assert it

The core criticism was "would never work for large projects." Answer it with measurements:

- **Fixtures:** script-download large real public OpenAPI descriptions at pinned commits (for example GitHub's `rest-api-description` and Stripe's `openapi` repositories — verify their licences; download in a script, do not vendor them).
- **Targets to measure and report** (adjust honestly if missed, and explain why): full compare of the largest fixture in seconds, not minutes; verify ≥1M JSONL samples with flat memory (set and report a memory ceiling); linear-or-better scaling with corpus size; cached re-runs of unchanged stages near-instant.
- `packages/bench` produces machine-readable results and regenerates `docs/EVALUATION.md` from them. **No hand-written performance or accuracy numbers anywhere — README included.**

---

## 9. Correctness evaluation — the answer to "vibe coded"

Build a **seeded mutation benchmark** in `packages/bench`:

- Take several real specs; apply labelled mutations — genuinely breaking (remove enum value from a request field, tighten a bound, change a type, add a required request field, remove an endpoint/status, add a response enum value) and genuinely safe (add optional field, add endpoint, edit description, relax a bound).
- Generate corresponding traffic; run DRIFT and **oasdiff** (via its CLI or Docker image) on the identical set.
- Report precision, recall and F1 for BREAKING, false-positive rate on safe mutations, RISKY rate, and runtime. Commit the generator, the seed and the results script so anyone can reproduce the table.

---

## 10. Security requirements

Threat model in `docs/SECURITY.md`. Minimum: no remote `$ref` fetching by default (SSRF); YAML parsing safe against resource exhaustion (size/depth limits); streaming limits; HTML escaping + a strict CSP; redaction on by default; secrets only from env (validated with zod at startup); signed artifact URLs with short expiry; webhook HMAC verification; least-privilege GitHub tokens/permissions; dependency audit in CI; no secrets or PII in logs.

---

## 11. Quality gates

- CI (GitHub Actions): install → typecheck → lint → unit tests → integration tests (Testcontainers: Postgres, Redis, MinIO) → build → Playwright e2e for critical paths (login, create project, upload run, view canvas, re-run stage) → DRIFT dogfood check → bench smoke run.
- Coverage thresholds enforced in CI: `packages/core` and `packages/rules` ≥ 90%, overall ≥ 80%.
- Property-based tests for the diff and verify stages; golden-file tests for every report format; a regression test for every bug fixed.
- Husky + lint-staged, Prettier, ESLint, Conventional Commits, Changesets for versioning the CLI/Action.
- ADRs in `docs/adr/` for every significant decision (e.g. SSE vs WebSockets, parser choice, rules-as-data).

---

## 12. Team ownership and explainability

Four students must each be able to defend their part to examiners. For every package, write `docs/modules/<package>.md`: purpose, public API, data flow, key design decisions, known limitations, and "questions an examiner might ask" with answers. Suggested ownership (the team may adjust):

| Owner                               | Area                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Person 1 — Frontend & UI            | `apps/web` UI: run canvas, inspector, diff view, design system, accessibility                                   |
| Person 2 — Auth & application logic | Auth.js, middleware, RBAC, orgs/invites, API keys, audit log                                                    |
| Person 3 — Database & backend       | `packages/db`, ingestion API, object storage, queue + `apps/worker`, SSE                                        |
| Person 4 — Pipeline/CI-CD & testing | `packages/rules` + Classify/Report stages, CLI gate semantics, GitHub Action/App, CI pipeline, `packages/bench` |

Engine stages 1–4 (ingest, diff, corpus, verify) are shared: split them between Persons 3 and 4 in the PLAN, with one clear owner per stage.

---

## 13. How to work (follow exactly)

1. **Inventory.** Read the deck and any existing code. Write `docs/INVENTORY.md`: what exists, what is real, what is simulated, what is reusable.
2. **Plan, then stop.** Write `docs/PLAN.md`: milestones, acceptance criteria per milestone, owner per module, risks, open questions. Write the initial ADRs. **Stop and wait for my approval before writing product code.**
3. **Milestones, in this order** (each must end green in CI with a runnable demo):
   - **M0** Monorepo, tooling, CI skeleton, docker-compose, env validation.
   - **M1** Core: Ingest + IR + Diff, with extensive unit tests.
   - **M2** Core: Corpus + Verify + Classify + rules package; evidence end to end.
   - **M3** CLI + all report formats + exit codes; golden tests; first bench run.
   - **M4** GitHub Action + dogfooding on this repo.
   - **M5** DB, auth, orgs/RBAC, API keys, ingestion API, object storage.
   - **M6** Worker/queue, SSE live runs, stage re-runs, observability.
   - **M7** Web UI: canvas, inspector, diff view, policies/suppressions, setup wizard.
   - **M8** GitHub App mode, full mutation benchmark vs oasdiff, performance benchmark, EVALUATION.md.
   - **Stretch (only after M8 is green):** consumer blast radius (which client ids in the traffic are affected by each BREAKING change), auto-generated migration guide in the PR comment, suggested non-breaking alternative (e.g. "keep the old enum value and mark it deprecated"), production drift monitoring (sample live traffic and alert when it diverges from the published contract), an optional LLM explainer that is **grounded only in stored evidence, off by default, and never decides severity**.
4. **Working rules:**
   - Small, reviewable commits with Conventional Commit messages.
   - Never stub something and present it as working. Anything simulated is labelled `SIMULATED` in code and UI and tracked in `docs/INVENTORY.md` until removed.
   - When unsure of a library's API, read its docs or installed type definitions; do not guess.
   - Prefer boring, well-understood solutions. Every added dependency or service needs a one-line justification in the PLAN or an ADR.
   - At the end of each milestone, post a short summary: what works (with the command to see it), test/coverage numbers from CI, what is still simulated, and what is next.

**Definition of done for the project:** a stranger can clone the repo, run `docker compose up` and one seed command, open a PR on a sample repo with a breaking API change, and watch DRIFT block it with a clear, evidence-backed explanation — and `docs/EVALUATION.md` shows reproducible accuracy and performance numbers against a real baseline.
