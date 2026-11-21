import { newId, type Db } from "@drift/db";
import type { z } from "zod";
import { can, type Actor } from "../auth/actor";
import { badRequest, forbidden } from "../http";
import { audit } from "./audit";
import { findProject } from "./projects";
import type { SuppressionCreate } from "./schemas";

export interface SuppressionView {
  id: string;
  project: string;
  changeId: string;
  reason: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * Accepts one change (by its engine id) for a project until a date. Like the policy file's suppressions, it needs
 * a reason and an expiry: nothing is suppressed forever or silently.
 */
export async function createSuppression(
  db: Db,
  actor: Actor,
  projectSlug: string,
  input: z.infer<typeof SuppressionCreate>,
  now = new Date()
): Promise<SuppressionView> {
  if (actor.kind !== "user" || !can(actor, "suppressions:write")) throw forbidden();
  const expiresAt = new Date(input.expiresAt);
  if (expiresAt <= now) throw badRequest("expiresAt: must be in the future");
  const project = await findProject(db, actor, projectSlug);
  const id = newId("suppression");
  const row = await db.$transaction(async (tx) => {
    const created = await tx.suppression.create({
      data: {
        id,
        orgId: actor.orgId,
        projectId: project.id,
        changeId: input.changeId,
        reason: input.reason,
        expiresAt,
        createdById: actor.userId,
      },
    });
    await audit(
      tx,
      actor,
      "suppression.create",
      { type: "suppression", id },
      { project: project.slug, changeId: input.changeId, expiresAt: input.expiresAt }
    );
    return created;
  });
  return {
    id,
    project: project.slug,
    changeId: row.changeId,
    reason: row.reason,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listSuppressions(db: Db, actor: Actor, projectSlug: string): Promise<SuppressionView[]> {
  if (!can(actor, "projects:read")) throw forbidden();
  const project = await findProject(db, actor, projectSlug);
  const rows = await db.suppression.findMany({
    where: { orgId: actor.orgId, projectId: project.id },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    project: project.slug,
    changeId: row.changeId,
    reason: row.reason,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }));
}
