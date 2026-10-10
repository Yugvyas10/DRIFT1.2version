"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Actor } from "@/server/auth/actor";
import type { Permission } from "@/server/auth/permissions";
import { authorize } from "@/server/auth/require-auth";
import { db, startRun, store } from "@/server/context";
import { HttpError, parse } from "@/server/http";
import { pageUser } from "@/server/page";
import { createKey, revokeKey } from "@/server/services/keys";
import { acceptInvitation, changeRole, invite, removeMember } from "@/server/services/members";
import { createOrg } from "@/server/services/orgs";
import { createProject } from "@/server/services/projects";
import { rerun } from "@/server/services/server-runs";
import {
  InvitationAccept,
  InvitationCreate,
  KeyCreate,
  OrgCreate,
  ProjectCreate,
  RoleChange,
} from "@/server/services/schemas";

/** What a form gets back: an error to show, or a secret (an API key or invitation token) to show once. */
export interface FormState {
  error?: string;
  secret?: string;
  done?: boolean;
}

/**
 * Server actions are the forms' way into the same services the REST API uses. Each one authenticates the session
 * against the database and authorises through `authorize`, exactly like a route handler; Next.js checks the
 * request's origin, so another site cannot submit them.
 */
async function actorIn(org: string, permission: Permission): Promise<Actor> {
  const user = await pageUser();
  return authorize({ kind: "user", userId: user.userId }, { slug: org }, permission, { db });
}

/** Runs an action and turns its HttpError into a message for the form. */
async function attempt(run: () => Promise<FormState | undefined>): Promise<FormState> {
  try {
    return (await run()) ?? { done: true };
  } catch (error) {
    if (error instanceof HttpError) return { error: error.detail ?? error.title };
    throw error;
  }
}

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

export async function createOrgAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await pageUser();
  const result = await attempt(async () => {
    const input = parse(OrgCreate, { name: text(form, "name"), slug: text(form, "slug") });
    await createOrg(db, user.userId, input);
    return { secret: input.slug };
  });
  if (result.secret !== undefined) redirect(`/dashboard/${result.secret}`);
  return result;
}

export async function acceptInvitationAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await pageUser();
  const result = await attempt(async () => {
    const input = parse(InvitationAccept, { token: text(form, "token") });
    return { secret: (await acceptInvitation(db, user.userId, input.token)).org };
  });
  if (result.secret !== undefined) redirect(`/dashboard/${result.secret}`);
  return result;
}

export async function createProjectAction(org: string, _: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const actor = await actorIn(org, "projects:write");
    const input = parse(ProjectCreate, {
      name: text(form, "name"),
      slug: text(form, "slug"),
      ...(text(form, "repo") === undefined ? {} : { repo: text(form, "repo") }),
      ...(text(form, "specPath") === undefined ? {} : { specPath: text(form, "specPath") }),
    });
    await createProject(db, actor, input);
    revalidatePath(`/dashboard/${org}`);
    return undefined;
  });
}

export async function createKeyAction(org: string, _: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const actor = await actorIn(org, "keys:write");
    const project = text(form, "project");
    const input = parse(KeyCreate, {
      name: text(form, "name"),
      permissions: form.getAll("permissions"),
      ...(project === undefined ? {} : { project }),
    });
    const created = await createKey(db, actor, input);
    revalidatePath(`/settings/${org}/keys`);
    return { secret: created.key };
  });
}

export async function revokeKeyAction(org: string, keyId: string): Promise<void> {
  const actor = await actorIn(org, "keys:write");
  await revokeKey(db, actor, keyId);
  revalidatePath(`/settings/${org}/keys`);
}

export async function inviteAction(org: string, _: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const actor = await actorIn(org, "members:manage");
    const input = parse(InvitationCreate, { email: text(form, "email"), role: text(form, "role") });
    const invited = await invite(db, actor, input);
    revalidatePath(`/settings/${org}/members`);
    return { secret: invited.token };
  });
}

export async function changeRoleAction(org: string, userId: string, _: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const actor = await actorIn(org, "members:manage");
    await changeRole(db, actor, userId, parse(RoleChange, { role: text(form, "role") }).role);
    revalidatePath(`/settings/${org}/members`);
    return undefined;
  });
}

export async function removeMemberAction(org: string, userId: string): Promise<FormState> {
  return attempt(async () => {
    const actor = await actorIn(org, "org:read");
    await removeMember(db, actor, userId);
    revalidatePath(`/settings/${org}/members`);
    return undefined;
  });
}

/** Ends every session of the signed-in user, on every device: tokens issued before now stop working. */
export async function signOutEverywhereAction(): Promise<void> {
  const user = await pageUser();
  await db.user.update({ where: { id: user.userId }, data: { tokenVersion: { increment: 1 } } });
  redirect("/login");
}

/**
 * Re-runs a server-side run from its page: the same contracts, with the run's traffic or without it, and an
 * optional fail-on. A new corpus needs an upload, which is the CLI's job (`drift rerun <id> --traffic <file>`).
 */
export async function rerunAction(
  org: string,
  project: string,
  runId: string,
  _: FormState,
  form: FormData
): Promise<FormState> {
  let childId: string | undefined;
  const result = await attempt(async () => {
    const actor = await actorIn(org, "runs:write");
    const failOn = text(form, "failOn");
    const created = await rerun(
      db,
      store,
      actor,
      runId,
      {
        ...(form.get("dropTraffic") === "on" ? { traffic: null } : {}),
        ...(failOn === undefined ? {} : { failOn }),
      },
      startRun
    );
    childId = created.run.id;
    revalidatePath(`/dashboard/${org}/${project}`);
    return undefined;
  });
  if (childId !== undefined) redirect(`/dashboard/${org}/${project}/runs/${childId}`);
  return result;
}
