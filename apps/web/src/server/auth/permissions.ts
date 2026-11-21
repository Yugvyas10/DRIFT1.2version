import type { Role } from "@drift/db";

/** Everything a caller can be allowed to do. One list, so routes, roles and API keys cannot drift apart. */
export const PERMISSIONS = [
  "org:read",
  "org:manage",
  "members:read",
  "members:manage",
  "projects:read",
  "projects:write",
  "keys:read",
  "keys:write",
  "runs:read",
  "runs:write",
  "suppressions:write",
  "audit:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: Permission[] = ["org:read", "members:read", "projects:read", "runs:read"];
const MEMBER: Permission[] = [...VIEWER, "runs:write", "suppressions:write"];
const ADMIN: Permission[] = [...MEMBER, "projects:write", "keys:read", "keys:write", "members:manage", "audit:read"];
const OWNER: Permission[] = [...ADMIN, "org:manage"];

/** What each role may do (PLAN M5). Roles are read from the database on every request, never from a token. */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  VIEWER: new Set(VIEWER),
  MEMBER: new Set(MEMBER),
  ADMIN: new Set(ADMIN),
  OWNER: new Set(OWNER),
};

/** The permissions an API key can carry: keys are for CI, so they only read and write runs. */
export const API_KEY_PERMISSIONS = ["runs:read", "runs:write"] as const satisfies readonly Permission[];
export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number];

export function roleAllows(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

const RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

/**
 * Whether someone with `actor` may change a member from `current` to `next` (or invite with `next` when there is
 * no current role). Nobody grants or touches a role above their own, and only owners deal with owners.
 */
export function canAssignRole(actor: Role, current: Role | undefined, next: Role): boolean {
  if (!roleAllows(actor, "members:manage")) return false;
  if (actor === "OWNER") return true;
  return RANK[next] < RANK.OWNER && (current === undefined || RANK[current] < RANK.OWNER);
}
