"use server";

import { DEFAULT_LIMITS, parseDataText, sha256Hex } from "@drift/core";
import { artifactKey } from "@drift/platform";
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
import { createSuppression, deleteSuppression } from "@/server/services/suppressions";
import { deleteProjectPolicy, setProjectPolicy } from "@/server/services/policies";
import { completeRun } from "@/server/services/runs";
import { MAX_BROWSER_UPLOAD_BYTES, type RerunStage } from "@/lib/canvas";
import {
  InvitationAccept,
  InvitationCreate,
  KeyCreate,
  OrgCreate,
  ProjectCreate,
  RoleChange,
  SuppressionCreate,
} from "@/server/services/schemas";

/** What a form gets back: an error to show, or a secret (an API key or invitation token) to show once. */
export interface FormState {
  error?: string;
  secret?: string;
  /** A confirmation to show (role="status"). */
  notice?: string;
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

/** A file name the API accepts (it is only displayed): the base name, with anything unusual replaced. */
function displayName(name: string): string {
  const cleaned = (name.split(/[\\/]/).at(-1) ?? "").replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "");
  return (cleaned === "" ? "upload" : cleaned).slice(0, 255);
}

/** An uploaded file of the form, or undefined when none was chosen. Refuses files over the browser limit. */
async function upload(form: FormData, field: string): Promise<{ name: string; text: string } | undefined> {
  const value = form.get(field);
  if (!(value instanceof File) || value.size === 0) return undefined;
  if (value.size > MAX_BROWSER_UPLOAD_BYTES) {
    throw new HttpError(413, "Too large", `${field}: files up to 25 MiB here; use drift rerun for larger ones`);
  }
  return { name: displayName(value.name), text: await value.text() };
}

/** A policy or ruleset file as data (YAML or JSON), parsed with the engine's safe parser and its limits. */
function data(file: { name: string; text: string }, field: string): unknown {
  const parsed = parseDataText(file.text, file.name, DEFAULT_LIMITS);
  if (!parsed.ok) {
    const first = parsed.diagnostics[0];
    throw new HttpError(
      400,
      "Bad request",
      `${field}: ${first ? `${first.code} ${first.message}` : "not YAML or JSON"}`
    );
  }
  return parsed.value;
}

/**
 * Re-runs a server-side run from one stage of its canvas (PLAN M7): a child run with the same contracts and a
 * new corpus or seed (Corpus, Verify) or policy, rules or fail-on (Classify), through the same service as the API.
 * A file chosen here is stored by the server, which then completes the run exactly as an API client would, so
 * its hash is still checked from storage. Larger corpora go through `drift rerun <id> --traffic <file>`.
 */
export async function rerunStageAction(
  org: string,
  project: string,
  runId: string,
  stage: RerunStage,
  _: FormState,
  form: FormData
): Promise<FormState> {
  let childId: string | undefined;
  const result = await attempt(async () => {
    const actor = await actorIn(org, "runs:write");
    const body: Record<string, unknown> = {};
    const files: { text: string; contentType: string }[] = [];
    if (stage === "corpus") {
      const traffic = await upload(form, "traffic");
      if (traffic && form.get("dropTraffic") === "on") {
        throw new HttpError(400, "Bad request", 'Choose a traffic file or "without traffic", not both');
      }
      if (traffic) {
        const format = /\.(har|json)$/i.test(traffic.name) ? "har" : "jsonl";
        body.traffic = {
          name: traffic.name,
          sha256: sha256Hex(traffic.text),
          size: Buffer.byteLength(traffic.text),
          format,
        };
        files.push({ text: traffic.text, contentType: format === "har" ? "application/json" : "application/x-ndjson" });
      } else if (form.get("dropTraffic") === "on") {
        body.traffic = null;
      }
    }
    if (stage === "corpus" || stage === "verify") {
      const seed = text(form, "seed");
      if (seed !== undefined) {
        if (!/^[0-9]{1,10}$/.test(seed)) throw new HttpError(400, "Bad request", "seed: a whole number, 0 or more");
        body.seed = Number(seed);
      }
    }
    if (stage === "classify") {
      const policy = await upload(form, "policy");
      const rules = await upload(form, "rules");
      if (policy) body.policy = data(policy, "policy");
      if (rules) body.rules = data(rules, "rules");
      const failOn = text(form, "failOn");
      if (failOn !== undefined) body.failOn = failOn;
    }
    const created = await rerun(db, store, actor, runId, body, startRun);
    for (const pending of created.uploads) {
      const file = files.find((candidate) => sha256Hex(candidate.text) === pending.sha256);
      if (file) await store.putText(artifactKey(actor.orgId, pending.sha256), file.text, file.contentType);
    }
    if (created.run.status === "uploading") await completeRun(db, store, actor, created.run.id, startRun);
    childId = created.run.id;
    revalidatePath(`/dashboard/${org}/${project}`);
    return undefined;
  });
  if (childId !== undefined) redirect(`/dashboard/${org}/${project}/runs/${childId}`);
  return result;
}

/**
 * Accepts one change for the project until a date, with a reason (from the change's page). Like the API's
 * suppressions it is audited, and server-side runs of the project apply it from their next run on.
 */
export async function suppressChangeAction(
  org: string,
  project: string,
  changeId: string,
  _: FormState,
  form: FormData
): Promise<FormState> {
  return attempt(async () => {
    const actor = await actorIn(org, "suppressions:write");
    const until = text(form, "expiresAt");
    // The policy's suppressions expire at the end of a day (they are compared by date).
    const expiresAt = until !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(until) ? `${until}T23:59:59Z` : until;
    const input = parse(SuppressionCreate, { changeId, reason: text(form, "reason"), expiresAt });
    await createSuppression(db, actor, project, input);
    revalidatePath(`/dashboard/${org}/${project}`);
    return {
      notice: `Suppressed until ${input.expiresAt.slice(0, 10)}. It applies from the project's next server-side run.`,
    };
  });
}

/** Sets the project's policy from the settings page (YAML or JSON). */
export async function setPolicyAction(org: string, project: string, _: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const actor = await actorIn(org, "projects:write");
    const value = form.get("policy");
    const saved = await setProjectPolicy(db, actor, project, typeof value === "string" ? value : "");
    revalidatePath(`/dashboard/${org}/${project}/settings`);
    return {
      notice: `Saved (hash ${saved.hash.slice(0, 12)}). Runs without a policy of their own use it from now on.`,
    };
  });
}

export async function deletePolicyAction(org: string, project: string): Promise<void> {
  const actor = await actorIn(org, "projects:write");
  await deleteProjectPolicy(db, actor, project);
  revalidatePath(`/dashboard/${org}/${project}/settings`);
}

export async function deleteSuppressionAction(org: string, project: string, id: string): Promise<void> {
  const actor = await actorIn(org, "suppressions:write");
  await deleteSuppression(db, actor, project, id);
  revalidatePath(`/dashboard/${org}/${project}/settings`);
}
