import { newId, type Db } from "@drift/db";
import type { z } from "zod";
import { can, type Actor } from "../auth/actor";
import { conflict, forbidden, notFound } from "../http";
import { audit } from "./audit";
import { isUniqueViolation } from "./orgs";
import type { ProjectCreate } from "./schemas";

export interface ProjectView {
  id: string;
  slug: string;
  name: string;
  repo?: string;
  specPath?: string;
  createdAt: string;
}

function view(row: {
  id: string;
  slug: string;
  name: string;
  repo: string | null;
  specPath: string | null;
  createdAt: Date;
}): ProjectView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    ...(row.repo === null ? {} : { repo: row.repo }),
    ...(row.specPath === null ? {} : { specPath: row.specPath }),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createProject(db: Db, actor: Actor, input: z.infer<typeof ProjectCreate>): Promise<ProjectView> {
  if (!can(actor, "projects:write")) throw forbidden();
  const id = newId("project");
  try {
    const row = await db.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          id,
          orgId: actor.orgId,
          slug: input.slug,
          name: input.name,
          repo: input.repo ?? null,
          specPath: input.specPath ?? null,
        },
      });
      await audit(tx, actor, "project.create", { type: "project", id }, { slug: input.slug });
      return created;
    });
    return view(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("This organisation already has a project with that slug.");
    throw error;
  }
}

export async function listProjects(db: Db, actor: Actor): Promise<ProjectView[]> {
  if (!can(actor, "projects:read")) throw forbidden();
  const rows = await db.project.findMany({ where: { orgId: actor.orgId }, orderBy: { slug: "asc" } });
  return rows.map(view);
}

/** A project of the actor's organisation by slug; 404 otherwise (also for a key scoped to another project). */
export async function findProject(db: Db, actor: Actor, slug: string): Promise<{ id: string; slug: string }> {
  const project = await db.project.findUnique({
    where: { orgId_slug: { orgId: actor.orgId, slug } },
    select: { id: true, slug: true },
  });
  if (!project) throw notFound();
  if (actor.kind === "key" && actor.projectId !== null && actor.projectId !== project.id) throw notFound();
  return project;
}
