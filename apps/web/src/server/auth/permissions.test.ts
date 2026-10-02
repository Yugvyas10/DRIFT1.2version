import { describe, expect, it } from "vitest";
import { can, actorColumns, type Actor } from "./actor";
import { API_KEY_PERMISSIONS, canAssignRole, PERMISSIONS, ROLE_PERMISSIONS, roleAllows } from "./permissions";

describe("roles", () => {
  it("nest: each role can do everything the role below can", () => {
    const order = ["VIEWER", "MEMBER", "ADMIN", "OWNER"] as const;
    for (let i = 1; i < order.length; i++) {
      const lower = order[i - 1];
      const higher = order[i];
      if (!lower || !higher) throw new Error("unreachable");
      for (const permission of ROLE_PERMISSIONS[lower]) expect(roleAllows(higher, permission)).toBe(true);
      expect(ROLE_PERMISSIONS[higher].size).toBeGreaterThan(ROLE_PERMISSIONS[lower].size);
    }
    expect([...ROLE_PERMISSIONS.OWNER].sort()).toEqual([...PERMISSIONS].sort());
  });

  it("keep the sensitive permissions away from the lower roles (PLAN M5: VIEWER cannot create keys)", () => {
    expect(roleAllows("VIEWER", "keys:write")).toBe(false);
    expect(roleAllows("MEMBER", "keys:write")).toBe(false);
    expect(roleAllows("ADMIN", "keys:write")).toBe(true);
    expect(roleAllows("VIEWER", "runs:write")).toBe(false);
    expect(roleAllows("MEMBER", "audit:read")).toBe(false);
    expect(roleAllows("ADMIN", "org:manage")).toBe(false);
  });
});

describe("canAssignRole", () => {
  it("lets owners do anything, admins everything below owner, and nobody else anything", () => {
    expect(canAssignRole("OWNER", "ADMIN", "OWNER")).toBe(true);
    expect(canAssignRole("OWNER", "OWNER", "VIEWER")).toBe(true);
    expect(canAssignRole("ADMIN", "MEMBER", "ADMIN")).toBe(true);
    expect(canAssignRole("ADMIN", undefined, "VIEWER")).toBe(true);
    expect(canAssignRole("ADMIN", "MEMBER", "OWNER")).toBe(false);
    expect(canAssignRole("ADMIN", "OWNER", "MEMBER")).toBe(false);
    expect(canAssignRole("MEMBER", "VIEWER", "MEMBER")).toBe(false);
    expect(canAssignRole("VIEWER", undefined, "VIEWER")).toBe(false);
  });
});

describe("actors", () => {
  const user: Actor = { kind: "user", userId: "usr_1", orgId: "org_1", role: "MEMBER" };
  const key: Actor = { kind: "key", keyId: "key_1", orgId: "org_1", projectId: null, permissions: ["runs:write"] };

  it("a user can do what the role allows; a key only what it was given", () => {
    expect(can(user, "runs:write")).toBe(true);
    expect(can(user, "keys:write")).toBe(false);
    expect(can(key, "runs:write")).toBe(true);
    expect(can(key, "runs:read")).toBe(false);
    expect(can(key, "keys:write")).toBe(false);
    expect([...API_KEY_PERMISSIONS]).toEqual(["runs:read", "runs:write"]);
  });

  it("are recorded in the audit log as a user or a key", () => {
    expect(actorColumns(user)).toEqual({ actorUserId: "usr_1", actorKeyId: null });
    expect(actorColumns(key)).toEqual({ actorUserId: null, actorKeyId: "key_1" });
  });
});
