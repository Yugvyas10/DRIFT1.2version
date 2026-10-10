import type { Db } from "@drift/db";
import { injectTraceContext, publishRunEvent, type Redis, type RunEventHub, type RunQueue } from "@drift/platform";
import type { Actor } from "../auth/actor";
import type { Permission } from "../auth/permissions";
import {
  authenticate,
  authorize,
  requireAuth,
  requireUser,
  type AuthDeps,
  type SessionClaims,
} from "../auth/require-auth";
import { badRequest, json, parse, readJson, route } from "../http";
import { clientAddress, type RateLimits } from "../rate-limit";
import { listAudit } from "../services/audit";
import { createKey, listKeys, revokeKey } from "../services/keys";
import { acceptInvitation, changeRole, invite, listMembers, removeMember } from "../services/members";
import { createOrg, listOrgs } from "../services/orgs";
import { createProject, listProjects } from "../services/projects";
import {
  artifactUrl,
  completeRun,
  createRun,
  getRun,
  listRuns,
  MAX_RUN_BODY_BYTES,
  orgOfRun,
  RunFilter,
  type StartRun,
} from "../services/runs";
import {
  InvitationAccept,
  InvitationCreate,
  KeyCreate,
  OrgCreate,
  ProjectCreate,
  Register,
  RoleChange,
  SuppressionCreate,
} from "../services/schemas";
import { createServerRun, listStages, MAX_SERVER_RUN_BODY_BYTES, rerun } from "../services/server-runs";
import { createSuppression, listSuppressions } from "../services/suppressions";
import { register } from "../services/users";
import { runEventStream } from "./events";
import type { ObjectStore } from "@drift/platform";

export interface ApiDeps {
  db: Db;
  store: ObjectStore;
  session(request: Request): Promise<SessionClaims | undefined>;
  /** Redis: run events, readiness. */
  redis: Redis;
  /** The queue of server-side runs. */
  queue: RunQueue;
  /** Live run events for this process (one subscriber connection). */
  hub: Pick<RunEventHub, "subscribe">;
  limits: RateLimits;
  /** bcrypt cost for new passwords (tests lower it). */
  passwordCost?: number;
  /** How often an idle event stream sends a keep-alive comment (tests shorten it). */
  heartbeatMs?: number;
}

/** Queues a server-side run, carrying the current trace so the worker's spans join it, and records the event. */
export function runStarter(deps: { queue: Pick<RunQueue, "enqueue">; redis: Redis }): StartRun {
  return async (run) => {
    await deps.queue.enqueue({ runId: run.id, orgId: run.orgId, trace: injectTraceContext() });
    await publishRunEvent(deps.redis, run.id, { type: "run.queued", at: new Date().toISOString() });
  };
}

/** Bodies of the management API are small. */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * The REST API of apps/web/openapi/drift-api.yaml as plain functions `(request, params) → Response`, so the route
 * files only bind them to the live database, object store and session, and tests bind them to test ones.
 * Every handler except `register` and the health checks starts with `requireAuth`, `requireUser` or `authenticate`.
 */
export function createApi(deps: ApiDeps) {
  const { db, store, redis } = deps;
  const auth: AuthDeps = {
    db,
    session: (request) => deps.session(request),
    // Every authenticated call counts against its caller's limit, whichever route it is.
    onAuthenticated: (identity) =>
      deps.limits.consume("api", identity.kind === "key" ? identity.keyId : identity.userId),
  };
  const start = runStarter(deps);
  const inOrg = (request: Request, org: string, permission: Permission) =>
    requireAuth(request, { org: { slug: org }, permission }, auth);

  /**
   * The actor for a route without an organisation in its path. An API key brings its organisation; a signed-in
   * user names one with `?org=<slug>`, which may be left out when they belong to exactly one.
   */
  async function actorFromCaller(request: Request, permission: Permission): Promise<Actor> {
    const identity = await authenticate(request, auth);
    if (identity.kind === "key") return authorize(identity, { id: identity.orgId }, permission, auth);
    const slug = new URL(request.url).searchParams.get("org");
    if (slug !== null) return authorize(identity, { slug }, permission, auth);
    const memberships = await db.membership.findMany({
      where: { userId: identity.userId },
      select: { orgId: true },
      take: 2,
    });
    const [only] = memberships;
    if (memberships.length !== 1 || !only) throw badRequest("org: name the organisation with ?org=<slug>");
    return authorize(identity, { id: only.orgId }, permission, auth);
  }

  /** The actor for a route about one run: the run decides the organisation, and outsiders get 404. */
  async function actorForRun(request: Request, runId: string, permission: Permission): Promise<Actor> {
    const identity = await authenticate(request, auth);
    return authorize(identity, { id: await orgOfRun(db, runId) }, permission, auth);
  }

  return {
    // ── accounts ──
    register: route(async (request) => {
      await deps.limits.consume("register", clientAddress(request));
      const input = parse(Register, await readJson(request, MAX_BODY_BYTES));
      return json({ user: await register(db, input, deps.passwordCost) }, 201);
    }),

    // ── organisations ──
    listOrgs: route(async (request) => {
      const { userId } = await requireUser(request, auth);
      return json({ orgs: await listOrgs(db, userId) });
    }),
    createOrg: route(async (request) => {
      const { userId } = await requireUser(request, auth);
      const input = parse(OrgCreate, await readJson(request, MAX_BODY_BYTES));
      return json({ org: await createOrg(db, userId, input) }, 201);
    }),

    // ── projects ──
    listProjects: route(async (request, params: { org: string }) => {
      const actor = await inOrg(request, params.org, "projects:read");
      return json({ projects: await listProjects(db, actor) });
    }),
    createProject: route(async (request, params: { org: string }) => {
      const actor = await inOrg(request, params.org, "projects:write");
      const input = parse(ProjectCreate, await readJson(request, MAX_BODY_BYTES));
      return json({ project: await createProject(db, actor, input) }, 201);
    }),

    // ── API keys ──
    listKeys: route(async (request, params: { org: string }) => {
      const actor = await inOrg(request, params.org, "keys:read");
      return json({ keys: await listKeys(db, actor) });
    }),
    createKey: route(async (request, params: { org: string }) => {
      const actor = await inOrg(request, params.org, "keys:write");
      const input = parse(KeyCreate, await readJson(request, MAX_BODY_BYTES));
      return json(await createKey(db, actor, input), 201);
    }),
    revokeKey: route(async (request, params: { org: string; keyId: string }) => {
      const actor = await inOrg(request, params.org, "keys:write");
      await revokeKey(db, actor, params.keyId);
      return new Response(null, { status: 204 });
    }),

    // ── members and invitations ──
    listMembers: route(async (request, params: { org: string }) => {
      const actor = await inOrg(request, params.org, "members:read");
      return json({ members: await listMembers(db, actor) });
    }),
    changeRole: route(async (request, params: { org: string; userId: string }) => {
      const actor = await inOrg(request, params.org, "members:manage");
      const input = parse(RoleChange, await readJson(request, MAX_BODY_BYTES));
      return json({ member: await changeRole(db, actor, params.userId, input.role) });
    }),
    removeMember: route(async (request, params: { org: string; userId: string }) => {
      // Leaving needs no permission beyond membership; removing someone else is checked in the service.
      const actor = await inOrg(request, params.org, "org:read");
      await removeMember(db, actor, params.userId);
      return new Response(null, { status: 204 });
    }),
    invite: route(async (request, params: { org: string }) => {
      const actor = await inOrg(request, params.org, "members:manage");
      const input = parse(InvitationCreate, await readJson(request, MAX_BODY_BYTES));
      return json(await invite(db, actor, input), 201);
    }),
    acceptInvitation: route(async (request) => {
      const { userId } = await requireUser(request, auth);
      const input = parse(InvitationAccept, await readJson(request, MAX_BODY_BYTES));
      return json(await acceptInvitation(db, userId, input.token));
    }),

    // ── suppressions and audit ──
    listSuppressions: route(async (request, params: { org: string; project: string }) => {
      const actor = await inOrg(request, params.org, "projects:read");
      return json({ suppressions: await listSuppressions(db, actor, params.project) });
    }),
    createSuppression: route(async (request, params: { org: string; project: string }) => {
      const actor = await inOrg(request, params.org, "suppressions:write");
      const input = parse(SuppressionCreate, await readJson(request, MAX_BODY_BYTES));
      return json({ suppression: await createSuppression(db, actor, params.project, input) }, 201);
    }),
    listAudit: route(async (request, params: { org: string }) => {
      const actor = await inOrg(request, params.org, "audit:read");
      const limit = Number(new URL(request.url).searchParams.get("limit") ?? "50");
      return json({ entries: await listAudit(db, actor, Number.isFinite(limit) ? limit : 50) });
    }),

    // ── runs ──
    createRun: route(async (request) => {
      const actor = await actorFromCaller(request, "runs:write");
      const body = await readJson(request, MAX_RUN_BODY_BYTES);
      const { replayed, ...result } = await createRun(db, store, actor, request.headers.get("idempotency-key"), body);
      return json(result, replayed ? 200 : 201);
    }),
    getRun: route(async (request, params: { runId: string }) => {
      const actor = await actorForRun(request, params.runId, "runs:read");
      return json(await getRun(db, actor, params.runId));
    }),
    completeRun: route(async (request, params: { runId: string }) => {
      const actor = await actorForRun(request, params.runId, "runs:write");
      return json(await completeRun(db, store, actor, params.runId, start));
    }),
    artifactUrl: route(async (request, params: { runId: string; kind: string }) => {
      const actor = await actorForRun(request, params.runId, "runs:read");
      return json(await artifactUrl(db, store, actor, params.runId, params.kind));
    }),
    listRuns: route(async (request, params: { project: string }) => {
      const actor = await actorFromCaller(request, "runs:read");
      const query = new URL(request.url).searchParams;
      const limit = query.get("limit");
      if (limit !== null && !/^[0-9]{1,3}$/.test(limit)) throw badRequest("limit: must be a number from 1 to 100");
      const filter = parse(
        RunFilter,
        Object.fromEntries(
          ["status", "gate", "mode", "branch"].flatMap((name) => {
            const value = query.get(name);
            return value === null ? [] : [[name, value]];
          })
        )
      );
      return json(
        await listRuns(db, actor, params.project, {
          cursor: query.get("cursor") ?? undefined,
          limit: limit === null ? undefined : Number(limit),
          filter,
        })
      );
    }),

    // ── server-side runs ──
    createServerRun: route(async (request, params: { project: string }) => {
      const actor = await actorFromCaller(request, "runs:write");
      const body = await readJson(request, MAX_SERVER_RUN_BODY_BYTES);
      const key = request.headers.get("idempotency-key");
      const { replayed, ...result } = await createServerRun(db, store, actor, params.project, key, body, start);
      return json(result, replayed ? 200 : 201);
    }),
    rerun: route(async (request, params: { runId: string }) => {
      const actor = await actorForRun(request, params.runId, "runs:write");
      const body = await readJson(request, MAX_SERVER_RUN_BODY_BYTES);
      return json(await rerun(db, store, actor, params.runId, body, start), 201);
    }),
    listStages: route(async (request, params: { runId: string }) => {
      const actor = await actorForRun(request, params.runId, "runs:read");
      return json({ stages: await listStages(db, actor, params.runId) });
    }),
    runEvents: route(async (request, params: { runId: string }) => {
      await actorForRun(request, params.runId, "runs:read");
      return runEventStream({ db, redis, hub: deps.hub }, params.runId, request, deps.heartbeatMs);
    }),

    // ── health ──
    liveness: route(() => Promise.resolve(json({ status: "ok" }))),
    readiness: route(async () => {
      const check = async (probe: () => Promise<unknown>) => {
        try {
          await probe();
          return "ok" as const;
        } catch {
          return "down" as const;
        }
      };
      const checks = {
        database: await check(() => db.$queryRaw`SELECT 1`),
        redis: await check(() => pingWithin(redis, 2000)),
        storage: await check(() => store.ping()),
      };
      const ready = Object.values(checks).every((state) => state === "ok");
      return json({ status: ready ? "ok" : "degraded", checks }, ready ? 200 : 503);
    }),
  };
}

export type Api = ReturnType<typeof createApi>;

/** PING, failing after `ms`: a client that is reconnecting would otherwise wait for Redis to come back. */
async function pingWithin(redis: Redis, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Redis did not answer in time"));
    }, ms);
  });
  try {
    await Promise.race([redis.ping(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
