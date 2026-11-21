# ADR-0001: Monorepo with pnpm workspaces + Turborepo; rebuild in place

Status: Accepted (2026-09-26)
Date: 2026-09-26
Owner: P4

## Context

The current repo is one Next.js app with no engine (see `INVENTORY.md`). The new system has a pure engine that four consumers must share: CLI, GitHub Action, worker and web. If each consumer copied engine code, their behaviour would drift apart. That is the failure mode the review criticised.

## Decision

- One repository using pnpm workspaces and Turborepo, laid out as in `PLAN.md` §3.1.
- `packages/core` is the only place engine logic lives. The dependency rules in `PLAN.md` §3.2 are enforced by lint.
- Rebuild **in place** in the existing repo. The legacy app is kept at a git tag (`legacy-v1`) and taken out of product paths in M0. Its design system is ported into `apps/web` (reuse list in `INVENTORY.md` §6).
- Libraries compile with `tsc` (project references). Only the CLI and the Action are bundled (esbuild), because a JavaScript Action must ship as a single file.

## Alternatives considered

- **Separate repos per component.** Rejected: engine and report-schema changes would need coordinated releases, which is too much overhead for a four-person team.
- **npm/yarn workspaces without Turborepo.** Workable, but we would lose task caching and dependency-ordered builds. Turborepo is one devDependency with no runtime cost.
- **Nx.** More powerful, but also more concepts to learn and defend. Turborepo is enough.
- **Start a fresh repo.** Rejected: it loses history and the issue/PR context. A tag keeps the legacy state recoverable.

## Consequences

- Anything that wants engine behaviour must call `core`. Code review rejects re-implementations.
- CI runs `turbo run typecheck lint test build`, which rebuilds only affected packages.
- Everyone must use the pinned Node LTS and pnpm versions (`.nvmrc`, `packageManager`).

## Questions an examiner might ask

- _Why is the engine a package rather than part of the web app?_ It must run in CI without any server (CLI and Action). The web app only displays its output.
- _How do you stop someone re-implementing logic in the UI?_ Lint rules block the forbidden imports, and the report schema is the only contract the UI sees.
