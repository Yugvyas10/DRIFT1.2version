import type { Role } from "@drift/db";
import { roleAllows, type Permission } from "./permissions";

/**
 * Who is acting, in which organisation, after `requireAuth`. Services take an Actor and never look at the request,
 * so a route handler and a server action are authorised by the same code.
 */
export type Actor =
  | { kind: "user"; userId: string; orgId: string; role: Role }
  | { kind: "key"; keyId: string; orgId: string; projectId: string | null; permissions: readonly string[] };

export function can(actor: Actor, permission: Permission): boolean {
  return actor.kind === "user" ? roleAllows(actor.role, permission) : actor.permissions.includes(permission);
}

/** The columns that record who did something in the audit log. */
export function actorColumns(actor: Actor): { actorUserId: string | null; actorKeyId: string | null } {
  return actor.kind === "user"
    ? { actorUserId: actor.userId, actorKeyId: null }
    : { actorUserId: null, actorKeyId: actor.keyId };
}
