import { createHash, randomBytes } from "node:crypto";
import { newId, type Db, type Prisma, type Role } from "@drift/db";
import type { z } from "zod";
import { can, type Actor } from "../auth/actor";
import { canAssignRole } from "../auth/permissions";
import { conflict, forbidden, notFound } from "../http";
import { audit } from "./audit";
import type { InvitationCreate } from "./schemas";

export interface MemberView {
  userId: string;
  email: string;
  name?: string;
  role: Role;
  joinedAt: string;
}

/** Invitations are valid for a week. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function listMembers(db: Db, actor: Actor): Promise<MemberView[]> {
  if (!can(actor, "members:read")) throw forbidden();
  const rows = await db.membership.findMany({
    where: { orgId: actor.orgId },
    include: { user: { select: { email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    userId: row.userId,
    email: row.user.email,
    ...(row.user.name === null ? {} : { name: row.user.name }),
    role: row.role,
    joinedAt: row.createdAt.toISOString(),
  }));
}

/** An organisation always keeps at least one OWNER. */
async function assertAnotherOwner(tx: Prisma.TransactionClient, orgId: string, userId: string): Promise<void> {
  const others = await tx.membership.count({ where: { orgId, role: "OWNER", userId: { not: userId } } });
  if (others === 0) throw conflict("An organisation needs at least one owner.");
}

/** Changes a member's role. Takes effect on that member's next request, because roles are read from the database. */
export async function changeRole(db: Db, actor: Actor, userId: string, role: Role): Promise<MemberView> {
  if (actor.kind !== "user" || !can(actor, "members:manage")) throw forbidden();
  return db.$transaction(async (tx) => {
    const member = await tx.membership.findUnique({
      where: { orgId_userId: { orgId: actor.orgId, userId } },
      include: { user: { select: { email: true, name: true } } },
    });
    if (!member) throw notFound();
    if (!canAssignRole(actor.role, member.role, role)) throw forbidden("You may not assign or change that role.");
    if (member.role === "OWNER" && role !== "OWNER") await assertAnotherOwner(tx, actor.orgId, userId);
    if (member.role !== role) {
      await tx.membership.update({ where: { id: member.id }, data: { role } });
      await audit(tx, actor, "member.role_change", { type: "user", id: userId }, { from: member.role, to: role });
    }
    return {
      userId,
      email: member.user.email,
      ...(member.user.name === null ? {} : { name: member.user.name }),
      role,
      joinedAt: member.createdAt.toISOString(),
    };
  });
}

/** Removes a member. Members may remove themselves (leave); otherwise it needs `members:manage`. */
export async function removeMember(db: Db, actor: Actor, userId: string): Promise<void> {
  if (actor.kind !== "user") throw forbidden();
  const self = actor.userId === userId;
  if (!self && !can(actor, "members:manage")) throw forbidden();
  await db.$transaction(async (tx) => {
    const member = await tx.membership.findUnique({ where: { orgId_userId: { orgId: actor.orgId, userId } } });
    if (!member) throw notFound();
    if (!self && !canAssignRole(actor.role, member.role, "VIEWER")) throw forbidden("You may not remove that member.");
    if (member.role === "OWNER") await assertAnotherOwner(tx, actor.orgId, userId);
    await tx.membership.delete({ where: { id: member.id } });
    await audit(tx, actor, "member.remove", { type: "user", id: userId }, { role: member.role });
  });
}

/**
 * Invites an email address. The token is returned once, for the inviter to pass on; only its SHA-256 is stored.
 * (DRIFT does not send email yet: INVENTORY §1.3.)
 */
export async function invite(
  db: Db,
  actor: Actor,
  input: z.infer<typeof InvitationCreate>,
  now = new Date()
): Promise<{ token: string; invitation: { id: string; email: string; role: Role; expiresAt: string } }> {
  if (actor.kind !== "user" || !can(actor, "members:manage")) throw forbidden();
  if (!canAssignRole(actor.role, undefined, input.role)) throw forbidden("You may not invite with that role.");
  const already = await db.membership.findFirst({ where: { orgId: actor.orgId, user: { email: input.email } } });
  if (already) throw conflict("That person is already a member.");
  const token = randomBytes(32).toString("base64url");
  const id = newId("invitation");
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  await db.$transaction(async (tx) => {
    await tx.invitation.create({
      data: {
        id,
        orgId: actor.orgId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        expiresAt,
        invitedById: actor.userId,
      },
    });
    await audit(tx, actor, "member.invite", { type: "invitation", id }, { email: input.email, role: input.role });
  });
  return { token, invitation: { id, email: input.email, role: input.role, expiresAt: expiresAt.toISOString() } };
}

/**
 * Accepts an invitation as the signed-in user. The token must be unused and unexpired, and the invitation must be
 * for this user's email address, so a leaked link cannot be used from another account.
 */
export async function acceptInvitation(
  db: Db,
  userId: string,
  token: string,
  now = new Date()
): Promise<{ org: string; role: Role }> {
  return db.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { org: true },
    });
    const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!invitation || !user || invitation.acceptedAt !== null || invitation.expiresAt <= now) throw notFound();
    if (invitation.email !== user.email) throw notFound();
    const existing = await tx.membership.findUnique({ where: { orgId_userId: { orgId: invitation.orgId, userId } } });
    if (existing) throw conflict("You are already a member of that organisation.");
    await tx.membership.create({
      data: { id: newId("membership"), orgId: invitation.orgId, userId, role: invitation.role },
    });
    await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: now } });
    const actor: Actor = { kind: "user", userId, orgId: invitation.orgId, role: invitation.role };
    await audit(
      tx,
      actor,
      "member.join",
      { type: "user", id: userId },
      { role: invitation.role, invitation: invitation.id }
    );
    return { org: invitation.org.slug, role: invitation.role };
  });
}
