# Tooling — monorepo, quality gates and CI

**Owner:** P4 (Pruthvi Gangapure). Reviewer P3. **Status:** M0 complete.

## Versions and why

| Tool       | Version                           | Note                                                                                                                                |
| ---------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Node.js    | 24 LTS (`.nvmrc`), engines `>=24` | Node 26 becomes LTS in October 2026; re-evaluate then.                                                                              |
| pnpm       | 12.6.0 (`packageManager`)         | Settings in `pnpm-workspace.yaml`; shared versions in its `catalog`.                                                                |
| TypeScript | 6.0.3                             | TS 7 (the native port) has no classic compiler API yet; typescript-eslint requires `<6.1` and Next.js type-checks through that API. |
| ESLint     | 9.39.5                            | eslint-config-next's React and jsx-a11y plugins do not support ESLint 10 yet.                                                       |
| Turborepo  | 2.11.4                            | Strict env mode: tasks see only the variables declared in `turbo.json`.                                                             |
| Vitest     | 5.0.2 + v8 coverage               | Per-package thresholds: 90% core and rules, 80% elsewhere.                                                                          |

## Commands

```bash
pnpm turbo run typecheck lint test build   # the full check CI runs
pnpm format                                # Prettier, print width 120
pnpm changeset                             # record a version bump
sh scripts/secret-scan.sh                  # gitleaks over the full history
```

## Git hooks (husky)

- **pre-commit:** lint-staged (Prettier + ESLint with per-file config lookup, so `apps/web` files get the Next.js rules), then gitleaks on staged changes. It uses a local `gitleaks` if installed, otherwise the pinned Docker image, otherwise it warns and CI still scans.
- **commit-msg:** commitlint (Conventional Commits).

## CI (`.github/workflows/ci.yml`)

Runs on pushes to `master` and on every pull request, with read-only permissions and actions pinned by commit SHA.

1. **check:** frozen install; format check; `turbo run typecheck lint test build`; `pnpm audit --prod --audit-level high`.
2. **secrets:** gitleaks over the full history.
3. **services:** docker compose up with `--wait`, all healthchecks pass, then the built worker must connect to Redis and exit 0.

## Known pitfalls

- **No empty workspace packages.** pnpm 12.6 never writes a lockfile entry for a workspace package without dependencies, yet `pnpm install --frozen-lockfile` (CI) fails without one. Create a package's `package.json` together with its first real dependency.
- **Web needs `APP_URL`.** `apps/web` typecheck and build load `next.config.ts`, which validates the environment. Locally, copy `apps/web/.env.example` to `.env.local`; CI sets the variable itself.

## Questions an examiner might ask

- **How is "overall coverage ≥ 80%" enforced if thresholds are per package?** Overall coverage is a weighted average of the packages' coverage. If every package is at least 80%, the average is too, and core and rules are held to 90%.
- **Why pin actions by SHA instead of `@v7`?** A tag can be moved to malicious code; a commit SHA cannot. The comment next to each SHA records the release it came from.
- **Why block dependency install scripts?** Install scripts run arbitrary code on every developer machine and CI runner. Only packages listed in `allowBuilds` may run them. Currently one package is listed, and it is explicitly denied.
