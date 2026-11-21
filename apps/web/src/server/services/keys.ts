import { newId, type Db } from "@drift/db";
import type { z } from "zod";
import { can, type Actor } from "../auth/actor";
import { generateApiKey } from "../auth/api-key";
import { forbidden, notFound } from "../http";
import { audit } from "./audit";
import type { KeyCreate } from "./schemas";

export interface KeyView {
  id: string;
  name: string;
  prefix: string;
  project?: string;
  permissions: string[];
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

interface Row {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  project: { slug: string } | null;
}

function view(row: Row): KeyView {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    ...(row.project === null ? {} : { project: row.project.slug }),
    permissions: row.permissions,
    createdAt: row.createdAt.toISOString(),
    ...(row.lastUsedAt === null ? {} : { lastUsedAt: row.lastUsedAt.toISOString() }),
    ...(row.expiresAt === null ? {} : { expiresAt: row.expiresAt.toISOString() }),
    ...(row.revokedAt === null ? {} : { revokedAt: row.revokedAt.toISOString() }),
  };
}

/**
 * Creates an API key. The plaintext key is returned here, once; only its SHA-256 is stored, so it can never be
 * shown again. Only a signed-in ADMIN or OWNER can create keys: a key cannot create keys.
 */
export async function createKey(
  db: Db,
  actor: Actor,
  input: z.infer<typeof KeyCreate>
): Promise<{ key: string; apiKey: KeyView }> {
  if (actor.kind !== "user" || !can(actor, "keys:write")) throw forbidden();
  let project: { id: string; slug: string } | null = null;
  if (input.project !== undefined) {
    project = await db.project.findUnique({
      where: { orgId_slug: { orgId: actor.orgId, slug: input.project } },
      select: { id: true, slug: true },
    });
    if (!project) throw notFound();
  }
  const generated = generateApiKey();
  const id = newId("apiKey");
  const row = await db.$transaction(async (tx) => {
    const created = await tx.apiKey.create({
      data: {
        id,
        orgId: actor.orgId,
        projectId: project?.id ?? null,
        name: input.name,
        prefix: generated.prefix,
        hash: generated.hash,
        permissions: [...new Set(input.permissions)],
        expiresAt: input.expiresAt === undefined ? null : new Date(input.expiresAt),
        createdById: actor.userId,
      },
      include: { project: { select: { slug: true } } },
    });
    await audit(
      tx,
      actor,
      "key.create",
      { type: "apiKey", id },
      { name: input.name, prefix: generated.prefix, permissions: input.permissions }
    );
    return created;
  });
  return { key: generated.key, apiKey: view(row) };
}

export async function listKeys(db: Db, actor: Actor): Promise<KeyView[]> {
  if (!can(actor, "keys:read")) throw forbidden();
  const rows = await db.apiKey.findMany({
    where: { orgId: actor.orgId },
    include: { project: { select: { slug: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(view);
}

/** Revokes a key: from now on it gets 401. Revoking twice is not an error. */
export async function revokeKey(db: Db, actor: Actor, keyId: string, now = new Date()): Promise<void> {
  if (actor.kind !== "user" || !can(actor, "keys:write")) throw forbidden();
  await db.$transaction(async (tx) => {
    const key = await tx.apiKey.findFirst({
      where: { id: keyId, orgId: actor.orgId },
      select: { id: true, revokedAt: true, prefix: true },
    });
    if (!key) throw notFound();
    if (key.revokedAt !== null) return;
    await tx.apiKey.update({ where: { id: key.id }, data: { revokedAt: now } });
    await audit(tx, actor, "key.revoke", { type: "apiKey", id: key.id }, { prefix: key.prefix });
  });
}
