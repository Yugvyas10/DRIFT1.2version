import { canonicalJson, DEFAULT_LIMITS, parseDataText, Policy, sha256Hex } from "@drift/core";
import { newId, type Db } from "@drift/db";
import { can, type Actor } from "../auth/actor";
import { badRequest, forbidden } from "../http";
import { audit } from "./audit";
import { findProject } from "./projects";

/** Largest policy document accepted (a policy is a short list of escalations and suppressions). */
export const MAX_POLICY_BYTES = 64 * 1024;

export interface PolicyView {
  /** The drift-policy/v1 document, as stored (parsed). */
  document: Policy;
  hash: string;
  updatedAt: string;
}

/** The project's policy, or undefined when it has none (the engine's default policy then applies). */
export async function getProjectPolicy(db: Db, actor: Actor, projectSlug: string): Promise<PolicyView | undefined> {
  if (!can(actor, "projects:read")) throw forbidden();
  const project = await findProject(db, actor, projectSlug);
  const row = await db.policy.findFirst({
    where: { orgId: actor.orgId, projectId: project.id },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return undefined;
  return { document: Policy.parse(row.document), hash: row.hash, updatedAt: row.createdAt.toISOString() };
}

/**
 * Sets the project's policy from YAML or JSON text (PLAN M7). Parsed with the engine's safe parser and limits and
 * validated as drift-policy/v1, so a suppression still needs a reason and an expiry. Server-side runs that bring no
 * policy of their own use it. Audited; ADMIN and OWNER only (a policy decides whether merges are blocked).
 */
export async function setProjectPolicy(db: Db, actor: Actor, projectSlug: string, text: string): Promise<PolicyView> {
  if (actor.kind !== "user" || !can(actor, "projects:write")) throw forbidden();
  if (Buffer.byteLength(text) > MAX_POLICY_BYTES) throw badRequest("policy: at most 64 KiB");
  const project = await findProject(db, actor, projectSlug);
  const parsed = parseDataText(text, "policy", DEFAULT_LIMITS);
  if (!parsed.ok) {
    const first = parsed.diagnostics[0];
    throw badRequest(`policy: ${first ? `line ${String(first.line ?? 1)}: ${first.message}` : "not YAML or JSON"}`);
  }
  const checked = Policy.safeParse(parsed.value);
  if (!checked.success) {
    throw badRequest(
      checked.error.issues
        .slice(0, 10)
        .map((issue) => `policy.${issue.path.join(".")}: ${issue.message}`)
        .join("; ")
    );
  }
  const document = checked.data;
  const hash = sha256Hex(canonicalJson(document));
  const row = await db.$transaction(async (tx) => {
    await tx.policy.deleteMany({ where: { orgId: actor.orgId, projectId: project.id } });
    const id = newId("policy");
    const created = await tx.policy.create({
      data: {
        id,
        orgId: actor.orgId,
        projectId: project.id,
        name: "project",
        document: document,
        hash,
      },
    });
    await audit(tx, actor, "policy.update", { type: "policy", id }, { project: project.slug, hash });
    return created;
  });
  return { document, hash, updatedAt: row.createdAt.toISOString() };
}

/** Removes the project's policy (audited): runs fall back to the engine's default policy. */
export async function deleteProjectPolicy(db: Db, actor: Actor, projectSlug: string): Promise<void> {
  if (actor.kind !== "user" || !can(actor, "projects:write")) throw forbidden();
  const project = await findProject(db, actor, projectSlug);
  await db.$transaction(async (tx) => {
    const removed = await tx.policy.deleteMany({ where: { orgId: actor.orgId, projectId: project.id } });
    if (removed.count > 0) {
      await audit(tx, actor, "policy.delete", { type: "project", id: project.id }, { project: project.slug });
    }
  });
}
