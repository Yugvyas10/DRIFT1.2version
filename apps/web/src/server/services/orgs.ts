import { newId, type Db } from "@drift/db";
import type { z } from "zod";
import type { Actor } from "../auth/actor";
import { conflict } from "../http";
import { audit } from "./audit";
import type { OrgCreate } from "./schemas";

export interface OrgView {
  id: string;
  slug: string;
  name: string;
  role: string;
}

/** Whether an error is Postgres's unique violation (Prisma P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/** Creates an organisation; the creator becomes its OWNER. */
export async function createOrg(db: Db, userId: string, input: z.infer<typeof OrgCreate>): Promise<OrgView> {
  const id = newId("organization");
  const actor: Actor = { kind: "user", userId, orgId: id, role: "OWNER" };
  try {
    await db.$transaction(async (tx) => {
      await tx.organization.create({ data: { id, slug: input.slug, name: input.name } });
      await tx.membership.create({ data: { id: newId("membership"), orgId: id, userId, role: "OWNER" } });
      await audit(tx, actor, "org.create", { type: "organization", id }, { slug: input.slug });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("That organisation slug is taken.");
    throw error;
  }
  return { id, slug: input.slug, name: input.name, role: "OWNER" };
}

/** The organisations the user belongs to, with their role in each. */
export async function listOrgs(db: Db, userId: string): Promise<OrgView[]> {
  const memberships = await db.membership.findMany({
    where: { userId },
    include: { org: true },
    orderBy: { org: { slug: "asc" } },
  });
  return memberships.map((m) => ({ id: m.org.id, slug: m.org.slug, name: m.org.name, role: m.role }));
}
