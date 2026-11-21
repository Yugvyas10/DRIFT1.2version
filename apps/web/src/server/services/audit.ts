import { newId, type Db, type Prisma } from "@drift/db";
import { actorColumns, can, type Actor } from "../auth/actor";
import { forbidden } from "../http";

/** Security-relevant actions that are recorded (PLAN M5). */
export type AuditAction =
  | "org.create"
  | "project.create"
  | "key.create"
  | "key.revoke"
  | "member.invite"
  | "member.join"
  | "member.role_change"
  | "member.remove"
  | "suppression.create";

type Tx = Prisma.TransactionClient;

/**
 * Appends one audit entry, inside the transaction of the change it records, so there is no change without its
 * entry and no entry without its change. Metadata never contains secrets (no keys, tokens or passwords).
 */
export async function audit(
  tx: Tx,
  actor: Actor,
  action: AuditAction,
  target: { type: string; id: string },
  metadata: Prisma.InputJsonObject = {}
): Promise<void> {
  await tx.auditLog.create({
    data: {
      id: newId("audit"),
      orgId: actor.orgId,
      ...actorColumns(actor),
      action,
      targetType: target.type,
      targetId: target.id,
      metadata,
    },
  });
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: { user?: string; key?: string };
  target: { type: string; id: string };
  metadata: unknown;
  createdAt: string;
}

/** The organisation's audit log, newest first. */
export async function listAudit(db: Db, actor: Actor, limit = 50): Promise<AuditEntry[]> {
  if (!can(actor, "audit:read")) throw forbidden();
  const rows = await db.auditLog.findMany({
    where: { orgId: actor.orgId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actor: {
      ...(row.actorUserId === null ? {} : { user: row.actorUserId }),
      ...(row.actorKeyId === null ? {} : { key: row.actorKeyId }),
    },
    target: { type: row.targetType, id: row.targetId },
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  }));
}
