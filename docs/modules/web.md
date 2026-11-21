# @drift/web — dashboard and REST API

**Owners:** UI P1 (Prathamesh Yewale); auth, RBAC and API keys P2 (Yug Vyas); ingestion API and storage P3 (Tanishq Chavan). **Status:** M5 — sign-in, organisations and roles, API keys, the run upload API with object storage, and a minimal run list. The run canvas and live runs arrive in M6–M7.

## Run it

```bash
docker compose -f infra/docker-compose.yml up -d --wait
cp apps/web/.env.example apps/web/.env.local
DATABASE_URL=postgresql://drift:drift-local-only@localhost:5432/drift pnpm --filter @drift/db run migrate:deploy
pnpm --filter @drift/web dev   # http://localhost:3000
```

Register at `/register`, create an organisation, a project and an API key, then:

```bash
DRIFT_API_KEY=drift_… pnpm --filter @drift/cli exec drift compare --base ../../examples/petstore/v1.yaml \
  --head ../../examples/petstore/v2-breaking.yaml --upload --project <slug> --api-url http://localhost:3000
```

## Layout

| Path                              | Role                                                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openapi/drift-api.yaml`          | The API's contract (23 operations). DRIFT's CI runs DRIFT on it, and the integration tests check every response against it.                                                                                                |
| `src/server/auth/require-auth.ts` | **The one way in.** `authenticate` (API key or session, checked against the database), `authorize` (organisation and permission), `requireAuth` (both).                                                                    |
| `src/server/auth/`                | `permissions.ts` (roles → permissions), `api-key.ts`, `password.ts` (bcrypt, cost 12), `session.ts` (reads next-auth's cookie), `options.ts` (next-auth configuration).                                                    |
| `src/server/services/`            | Organisations, projects, keys, members and invitations, suppressions, audit, runs, users. Each takes an `Actor`, filters by `actor.orgId`, and writes its audit entry in the same transaction.                             |
| `src/server/api/`                 | `handlers.ts`: every operation as `(request, params) → Response`. `routes.ts`: the route table and dispatcher.                                                                                                             |
| `src/server/storage.ts`           | S3-compatible storage through the AWS SDK: pre-signed PUT and GET URLs, and `inspect` (the server reads an object and hashes it).                                                                                          |
| `src/server/context.ts`           | The only file that reads the environment: the live database client, object store, session reader and API.                                                                                                                  |
| `src/app/api/v1/[...path]`        | One catch-all route that dispatches through the route table. `src/app/api/auth/[...nextauth]` is next-auth.                                                                                                                |
| `src/proxy.ts`                    | Before every page: redirect to `/login` without a session cookie (for `/dashboard`, `/settings`), and set the Content-Security-Policy with a fresh nonce.                                                                  |
| `src/app/`                        | Pages: `/login`, `/register`, `/dashboard` (organisations), `/dashboard/[org]` (projects), `/dashboard/[org]/[project]` (run list), `/settings/[org]/keys`, `/members`, `/audit`. `actions.ts`: the forms' server actions. |

## Authentication and authorisation

- **Identity** is next-auth v4 (ADR-0007): email and password, and GitHub OAuth when `GITHUB_ID` and `GITHUB_SECRET` are set. The session is an encrypted JWT with the user's id and `tokenVersion`, and nothing about roles.
- **Every request is checked against the database:** the user still exists, the session's `tokenVersion` is current ("Sign out everywhere" raises it), the key is not revoked or expired. The role comes from the `Membership` row at that moment, so a role change or removal applies on the next request.
- **Tenancy:** not a member of the organisation (or a key from another one) → **404**, so other tenants' resources look non-existent. A member without the permission → **403**.
- **Roles:** VIEWER reads; MEMBER also uploads runs and creates suppressions; ADMIN also manages projects, keys, members and reads the audit log; OWNER also manages the organisation. Nobody assigns a role above their own, only owners change owners, and an organisation always keeps one owner.
- **API keys:** `drift_` + 256 random bits, shown once, stored as SHA-256. They carry `runs:read` and/or `runs:write` only, optionally limited to one project, and can expire. Only a signed-in ADMIN or OWNER creates or revokes them.
- **Pages** use the same `authenticate` and `authorize` through `src/server/page.ts`, and forms go through server actions that call the same services. There is no development login in any build.

## Uploading a run

1. `POST /api/v1/runs` with an `Idempotency-Key`: the report must be a valid `drift-report/v1` (422 otherwise), the body at most 8 MiB (413). The run, its stage rows, changes and evidence summaries are stored from the report. Each announced artifact gets a pre-signed PUT URL (15 minutes) under `orgs/<orgId>/sha256/<sha256>`.
2. The client PUTs the artifacts to storage directly.
3. `POST /api/v1/runs/{id}/complete`: the server reads each artifact from storage and checks its size and SHA-256 before the run becomes `complete`.

The same key with the same body returns the same run (200); with a different body, 409. An artifact the organisation already stored is reused without an upload. Artifacts are read back through signed GET URLs that last 5 minutes.

## Tests

| Run                                             | What                                                                                                                                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @drift/web test`                 | Unit: env validation, HTTP helpers, permissions, keys, passwords, the session reader, CSP, and the route table against the contract (same operations, both ways).                                                                       |
| `pnpm --filter @drift/web run test:integration` | The API against **real Postgres and S3** in containers (Testcontainers; needs Docker). Requests go through the same dispatcher as production, and **every exchange is checked against `drift-api.yaml`** with core's `ContractChecker`. |
| `pnpm --filter @drift/web run test:e2e`         | Playwright against the built app: register → organisation → project → key shown once → the real `drift compare --upload` → run in the list; revoke → 401; sign out everywhere; CSP; axe accessibility checks.                           |

## Known limitations

- **No email is sent.** An invitation's token is shown once to the inviter, who passes it on. There is no password reset yet.
- **Sign-in and registration are not rate limited** until M6 (Redis-backed, SECURITY T16).
- **GitHub sign-in** is implemented and its account rule is tested, but it is not exercised end to end: that needs a GitHub OAuth app.
- The run list is minimal (no filters, no run page). Suppressions are stored and audited; applying them to uploaded runs server-side comes with server-side runs in M6.
- `readyz` checks the database and object storage; Redis joins in M6.

## Questions an examiner might ask

- **JWT sessions cannot be revoked. Isn't that a problem?** The token is never trusted alone: each request loads the user and compares `tokenVersion`, and the role comes from the database. Raising `tokenVersion` kills every session; an end-to-end test replays an old cookie and gets the login page and a 401.
- **Why 404 instead of 403 for another organisation?** A 403 would confirm that the organisation, project or run exists. Tests call every organisation-scoped route as an outsider and expect 404.
- **Can a client claim an upload it never made?** No. `complete` reads the object from storage and compares its size and SHA-256 with what was announced; a test uploads different bytes and gets 409.
- **How do you know the API matches its contract?** A unit test compares the route table with the contract's operations in both directions, and the integration harness validates every request and response with the engine's own validators; an undocumented status or field fails the test.
- **What stops another site from submitting forms as a signed-in user?** The API only accepts `application/json` bodies (a cross-site form cannot send that without a CORS preflight, and no CORS is allowed), the session cookie is `SameSite=Lax`, and Next.js checks the origin of server actions.
- **Why validate env in `next.config.ts`?** A missing variable should stop the process at startup with a clear message that names the variable and never its value.
