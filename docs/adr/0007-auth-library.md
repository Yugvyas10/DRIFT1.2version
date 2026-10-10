# ADR-0007: Authentication library

Status: Accepted (2026-09-26): next-auth v4
Date: 2026-09-26
Owner: P2

## Context

MASTER_PROMPT names Auth.js (credentials + GitHub OAuth). State of the options on 2026-09-26, from the npm registry:

- `next-auth` **v4** is the stable line (`latest` = 4.24.x). It lists Next ≤ 16 and React ≤ 19 as peers and receives maintenance releases.
- Auth.js **v5** is still published only as a beta (`5.0.0-beta.x`).
- Better Auth is an actively developed alternative; Auth.js maintenance moved under the Better Auth team in 2025.

The legacy app already uses next-auth v4, so the team knows it.

## Decision (recommended)

Use **next-auth v4** for _identity only_: the credentials provider (bcrypt) and the GitHub OAuth provider.

- Credentials in v4 requires JWT sessions. Mitigations:
  - short `maxAge`;
  - a `tokenVersion` on User, checked in the `jwt` callback (sign-out-everywhere and password change revoke tokens);
  - **authorization never reads roles from the token.** `requireAuth()` loads membership and role from the DB on every request, so a role change or removal takes effect immediately.
- Orgs, RBAC, invitations, API keys and audit are our own code in `packages/db` + `apps/web`. The library choice affects only sign-in.
- No development-only login fallback exists in any build (the legacy one is deleted).

## As built (M5)

- There is no `Session` table: with JWT sessions there is nothing to store. `User.tokenVersion` is in the token and compared with the database on every request, in `authenticate` (`apps/web/src/server/auth/require-auth.ts`).
- Sessions last 8 hours. "Sign out everywhere" raises `tokenVersion`.
- The session is read from next-auth's cookie only, never from an `Authorization` header (that header is for API keys).
- A GitHub sign-in never attaches itself to an existing password account with the same email address: it is refused, because merging would let whoever controls that GitHub account take the account over.

## Alternatives considered

- **Auth.js v5 beta.** Better App Router ergonomics, but running a beta for security-critical code needs its own justification.
- **Better Auth.** Database sessions (instant revocation) plus org and API-key plugins. However: it is a new library for the team; its plugins would replace the RBAC and API-key code the spec asks P2 to build and explain; and its default password hash differs from the spec's bcrypt/argon2 (configurable). This is the best choice if the team prefers DB sessions over JWT.

## Consequences

- If v4 has a security issue without a fix, we can swap the identity layer without touching authorization, because `requireAuth()` is the only integration point.

## Questions an examiner might ask

- _JWTs cannot be revoked — isn't that a problem?_ Authorization is checked against the DB on each request, and `tokenVersion` invalidates sessions on sign-out-everywhere or password change.
- _Why not use the library's RBAC?_ next-auth has none. Keeping authorization in our code makes it testable and explainable.
