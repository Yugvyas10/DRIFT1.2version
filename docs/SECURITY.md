# Security

Owner: P2 (Yug Vyas). Every change that touches a boundary below updates this file.

## 1. What we protect

| Asset                                             | Why it matters                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| Customer API contracts (OpenAPI specs)            | Often private; they describe internal systems.                          |
| Traffic corpora (recorded requests and responses) | May contain credentials and personal data.                              |
| Reports, evidence and artifacts                   | Contain redacted payloads and contract details.                         |
| API keys, sessions, OAuth tokens, webhook secrets | Grant access to an organisation's data or to GitHub.                    |
| The gate decision itself                          | A forged pass lets a breaking change ship; a forged fail blocks a team. |
| The DRIFT supply chain (dependencies, CI, Action) | A compromised build would run inside every customer's CI.               |

## 2. Trust boundaries

1. **Untrusted input into the engine:** spec files and traffic files come from a pull request, which anyone who can open a PR controls.
2. **CI runner → platform:** reports uploaded with an API key (M5).
3. **Browser → web app:** sessions, RBAC, org scoping (M5).
4. **GitHub → web app:** webhooks, verified by HMAC (M8).
5. **Web/worker → Postgres, Redis, object storage:** internal network. Credentials come from the environment.

## 3. Threats and controls

Status: **Done** = implemented and tested; **Mx** = planned in that milestone (see PLAN §6).

| #   | Threat                                                                         | Control                                                                                                                                                                                         | Status               |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| T1  | Secrets committed to the repository                                            | gitleaks on staged changes (pre-commit) and on the full history (CI); `.env` files git-ignored; only `.env.example` committed                                                                   | **Done** (M0)        |
| T2  | Supply-chain compromise via dependencies                                       | Exact versions and a lockfile; pnpm blocks install scripts unless allow-listed (`allowBuilds`); pnpm's minimum release age; `pnpm audit --prod` in CI                                           | **Done** (M0)        |
| T3  | Supply-chain compromise via CI actions                                         | Third-party actions pinned to full commit SHAs; workflow `permissions: contents: read`; `persist-credentials: false`                                                                            | **Done** (M0)        |
| T4  | App starts half-configured (e.g. missing secret silently defaulted)            | zod environment validation that fails fast in every environment (web and worker)                                                                                                                | **Done** (M0)        |
| T5  | Clickjacking, MIME sniffing, referrer leaks                                    | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`                                                               | **Done** (M0)        |
| T6  | Script injection in the web app                                                | Nonce-based `script-src` CSP                                                                                                                                                                    | M5                   |
| T7  | SSRF through remote `$ref` in a PR-controlled spec                             | Remote refs refused by default; local refs confined to `--ref-root` after `realpath` (ADR-0003)                                                                                                 | **Done** (M1)        |
| T8  | Resource exhaustion from YAML (alias bombs, huge or deeply nested files)       | Limits on file size, alias count and nesting depth                                                                                                                                              | **Done** (M1)        |
| T9  | Credentials or personal data from traffic leak into reports, artifacts or logs | Redaction on by default before storage or reporting; redacted pointers tracked; errors at redacted values are unknown; canary test (8 planted secrets and personal data reach no output)        | **Done** (M2)        |
| T10 | XSS through a crafted spec or payload in the HTML report or PR comment         | Every value escaped per format; no scripts or external assets; CSP `default-src 'none'` + hashed stylesheet; Markdown fences longer than any backtick run; hostile-report tests for all formats | **Done** (M3)        |
| T11 | Over-privileged GitHub token in the Action or App                              | Documented least-privilege `permissions`; installation tokens scoped to contents read, checks write, pull-requests write                                                                        | M4 / M8              |
| T12 | Cross-tenant data access                                                       | Every query scoped by organisation through one `requireAuth()` helper; roles read from the DB on each request; tests assert 404 across orgs                                                     | M5                   |
| T13 | Stolen or leaked API key                                                       | Keys shown once, stored as SHA-256, scoped, revocable, `lastUsedAt` recorded; `drift_` prefix so secret scanners can recognise them                                                             | M5                   |
| T14 | Long-lived artifact links                                                      | Short-lived signed URLs; org-prefixed, content-addressed keys (ADR-0006)                                                                                                                        | M5                   |
| T15 | Forged or replayed GitHub webhooks                                             | HMAC-SHA256 over the raw body with constant-time comparison; delivery-id idempotency                                                                                                            | M8                   |
| T16 | Brute force or abuse of the API                                                | Redis-backed rate limiting (replaces the legacy in-memory limiter)                                                                                                                              | M6                   |
| T17 | Secrets or personal data in logs                                               | Worker logs `host:port`, never connection URLs (tested); pino redaction paths for all services                                                                                                  | Partly done (M0), M6 |
| T18 | Local service credentials reused elsewhere                                     | Compose ports bound to `127.0.0.1`; credentials are labelled local-only and overridable                                                                                                         | **Done** (M0)        |
| T19 | Regular-expression denial of service in the redaction detectors                | Every quantifier in the detectors is bounded; a timing test runs them on adversarial input                                                                                                      | **Done** (M2)        |
| T20 | A secret in a malformed traffic line leaking through error messages            | Malformed-line reasons name the field and problem kind only, never the input; tested with a secret in the line                                                                                  | **Done** (M2)        |
| T21 | Resource exhaustion from traffic files                                         | JSONL streamed with a 4 MiB line limit; per-operation and total sample caps; HAR limited to 256 MiB                                                                                             | **Done** (M2)        |
| T22 | Option or command injection through a git revision in `--base <ref>:<path>`    | `execFile` with an argument array (no shell); refs starting with `-` refused; paths confined to the repository; tested                                                                          | **Done** (M3)        |
| T23 | A poisoned local stage cache                                                   | Keys are content hashes of all inputs; entries are written atomically; a damaged entry is recomputed; the cache is local to the user's checkout (`.drift/`, git-ignored)                        | **Done** (M3)        |

## 4. Incident log

| Date       | Finding                                                                                                 | Action                                                                                                                                                                                                                          | Status                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-26 | A live Groq API key was hardcoded as a fallback in the legacy `app/api/ai/chat/route.ts` (uncommitted). | Literal removed before the legacy snapshot commit; gitleaks confirms it is in no commit; the route itself was removed in M0. The key may exist outside this repository (deployments, other clones, the untracked local `.env`). | **Accepted risk (2026-09-28, P4):** rotation deferred because only the four team members use the key and it is in no commit. Rotate it if it is shared or deployed beyond the team. |

## 5. Reporting a vulnerability

Do not open a public issue. Contact the security lead (P2) directly, with steps to reproduce.
