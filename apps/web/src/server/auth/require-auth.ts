import type { Db } from "@drift/db";
import { forbidden, notFound, unauthorized } from "../http";
import { can, type Actor } from "./actor";
import { bearerKey, hashApiKey } from "./api-key";
import type { Permission } from "./permissions";

/** What a verified session token says: who, and which generation of their sessions. */
export interface SessionClaims {
  userId: string;
  tokenVersion: number;
}

export interface AuthDeps {
  db: Db;
  /** Reads and verifies the session token of a request (next-auth); undefined without a valid one. */
  session(request: Request): Promise<SessionClaims | undefined>;
  now?: () => Date;
}

/** A caller whose identity is established but who is not yet tied to an organisation. */
export type Identity =
  | { kind: "user"; userId: string }
  | { kind: "key"; keyId: string; orgId: string; projectId: string | null; permissions: readonly string[] };

/** `lastUsedAt` is refreshed at most this often, so a busy key does not write on every request. */
const LAST_USED_RESOLUTION_MS = 60_000;

/**
 * Establishes who is calling: an API key (`Authorization: Bearer drift_…`) or a signed-in user. 401 otherwise.
 * A revoked or expired key, a deleted user, and a session older than the user's `tokenVersion` are all refused,
 * because each is checked against the database on every request.
 */
export async function authenticate(request: Request, deps: AuthDeps): Promise<Identity> {
  const now = (deps.now ?? (() => new Date()))();
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    const key = bearerKey(authorization);
    if (key === undefined) throw unauthorized();
    const row = await deps.db.apiKey.findUnique({ where: { hash: hashApiKey(key) } });
    if (!row) throw unauthorized();
    if (row.revokedAt !== null || (row.expiresAt !== null && row.expiresAt <= now)) throw unauthorized();
    if (row.lastUsedAt === null || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
      await deps.db.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: now } });
    }
    return { kind: "key", keyId: row.id, orgId: row.orgId, projectId: row.projectId, permissions: row.permissions };
  }
  const claims = await deps.session(request);
  if (!claims) throw unauthorized();
  const user = await deps.db.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, tokenVersion: true },
  });
  if (!user) throw unauthorized();
  // A session issued before the user's tokenVersion was raised (password change, sign out everywhere) is dead.
  if (user.tokenVersion !== claims.tokenVersion) throw unauthorized();
  return { kind: "user", userId: user.id };
}

/** The organisation a request is about: by slug (from the URL) or by id (from a resource that was looked up). */
export type OrgRef = { slug: string } | { id: string };

/**
 * Ties an identity to an organisation and checks one permission.
 * - Not a member (or a key of another organisation): **404**, so other tenants' resources look non-existent.
 * - A member without the permission: **403**.
 * The role comes from the Membership row now, never from the session token.
 */
export async function authorize(
  identity: Identity,
  org: OrgRef,
  permission: Permission,
  deps: Pick<AuthDeps, "db">
): Promise<Actor> {
  let actor: Actor;
  if (identity.kind === "key") {
    if ("id" in org) {
      if (org.id !== identity.orgId) throw notFound();
    } else {
      const found = await deps.db.organization.findUnique({ where: { slug: org.slug }, select: { id: true } });
      if (found?.id !== identity.orgId) throw notFound();
    }
    actor = identity;
  } else {
    const membership = await deps.db.membership.findFirst({
      where: { userId: identity.userId, org: "id" in org ? { id: org.id } : { slug: org.slug } },
      select: { orgId: true, role: true },
    });
    if (!membership) throw notFound();
    actor = { kind: "user", userId: identity.userId, orgId: membership.orgId, role: membership.role };
  }
  if (!can(actor, permission)) throw forbidden(`This needs the permission "${permission}".`);
  return actor;
}

/**
 * The one helper every API route goes through (PLAN M5): authenticate, resolve the organisation, check the
 * permission. Routes whose organisation is only known from a resource call `authenticate`, load the resource,
 * then `authorize` with its `orgId`.
 */
export async function requireAuth(
  request: Request,
  options: { org: OrgRef; permission: Permission },
  deps: AuthDeps
): Promise<Actor> {
  return authorize(await authenticate(request, deps), options.org, options.permission, deps);
}

/** For routes that are about the signed-in user rather than an organisation (list my organisations, create one). */
export async function requireUser(request: Request, deps: AuthDeps): Promise<{ userId: string }> {
  const identity = await authenticate(request, deps);
  if (identity.kind !== "user") throw forbidden("This needs a signed-in user, not an API key.");
  return { userId: identity.userId };
}
