import { canonicalJson, parseRuleset, Policy, sha256Hex, type Ruleset } from "@drift/core";
import { newId, type Db, type Prisma } from "@drift/db";
import { artifactKey, type ObjectStore } from "@drift/platform";
import { z, ZodError } from "zod";
import { can, type Actor } from "../auth/actor";
import { badRequest, conflict, forbidden, parse } from "../http";
import { isUniqueViolation } from "./orgs";
import { findProject } from "./projects";
import { IdempotencyKey, ownRun, runView, uploadsFor, type RunView, type StartRun, type UploadView } from "./runs";

/** Largest body of a server-side run or re-run request: a policy and a whole ruleset fit. */
export const MAX_SERVER_RUN_BODY_BYTES = 512 * 1024;

/** Largest contract a server-side run accepts (the engine's own limit for one file is 20 MiB). */
export const MAX_SPEC_BYTES = 20 * 1024 * 1024;
/** Largest recorded-traffic file a server-side run accepts. */
export const MAX_TRAFFIC_BYTES = 256 * 1024 * 1024;

/** A file the client will upload: what it is called (shown in the report), its hash and size. */
const fileOf = (maxBytes: number) =>
  z.strictObject({
    // A file name, not a path: it is only ever displayed.
    name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/, "Use a plain file name"),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    size: z.number().int().min(1).max(maxBytes),
  });
const SpecFile = fileOf(MAX_SPEC_BYTES);
const TrafficFile = fileOf(MAX_TRAFFIC_BYTES).extend({ format: z.enum(["jsonl", "har"]) });

const Tuning = {
  /** A drift-policy/v1 document: escalations, suppressions (each with a reason and an expiry), fail-on. */
  policy: z.unknown().optional(),
  /** A complete drift-rules/v1 ruleset instead of the default one. */
  rules: z.unknown().optional(),
  failOn: z.enum(["breaking", "risky"]).optional(),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
};

export const ServerRunCreate = z.strictObject({
  trigger: z.enum(["ci", "manual", "app"]).default("manual"),
  commit: z.string().regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/),
  branch: z.string().min(1).max(255).optional(),
  pullRequest: z.number().int().min(1).optional(),
  base: SpecFile,
  head: SpecFile,
  traffic: TrafficFile.optional(),
  ...Tuning,
});

/** What a re-run changes. Anything left out stays as in the run being re-run; `traffic: null` removes it. */
export const RerunCreate = z.strictObject({ traffic: TrafficFile.nullable().optional(), ...Tuning });

/** A server-side run's options, as stored on the run and read by the worker. */
export const RunOptions = z.strictObject({
  base: z.strictObject({ name: z.string() }),
  head: z.strictObject({ name: z.string() }),
  traffic: z.strictObject({ name: z.string(), format: z.enum(["jsonl", "har"]) }).optional(),
  policy: Policy.optional(),
  /** Checked with `parseRuleset` when the run is created; the worker checks it again. */
  rules: z.record(z.string(), z.unknown()).optional(),
  failOn: z.enum(["breaking", "risky"]).optional(),
  seed: z.number().int().optional(),
});
export type RunOptions = z.infer<typeof RunOptions>;

type File = z.infer<typeof SpecFile>;
interface Input {
  kind: "input-base" | "input-head" | "input-traffic";
  file: File;
  contentType: string;
}

function checkedPolicy(value: unknown): z.infer<typeof Policy> | undefined {
  return value === undefined ? undefined : parse(Policy, value);
}

function checkedRules(value: unknown): Ruleset | undefined {
  if (value === undefined) return undefined;
  try {
    return parseRuleset(value);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const detail = error.issues
      .slice(0, 10)
      .map((issue) => `rules.${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw badRequest(detail);
  }
}

async function createRunWithInputs(
  db: Db,
  actor: Actor,
  data: Omit<Prisma.RunUncheckedCreateInput, "id" | "orgId" | "status" | "mode" | "options">,
  options: RunOptions,
  inputs: Input[],
  now: Date
): Promise<{ id: string; queued: boolean }> {
  const id = newId("run");
  // An input this organisation already stored and verified (the same contract as last time) needs no upload.
  const known = new Set(
    (
      await db.artifact.findMany({
        where: {
          orgId: actor.orgId,
          sha256: { in: inputs.map((input) => input.file.sha256) },
          verifiedAt: { not: null },
        },
        select: { sha256: true },
      })
    ).map((artifact) => artifact.sha256)
  );
  const queued = inputs.every((input) => known.has(input.file.sha256));
  await db.$transaction(async (tx) => {
    await tx.run.create({
      data: {
        ...data,
        id,
        orgId: actor.orgId,
        mode: "SERVER",
        status: queued ? "QUEUED" : "UPLOADING",
        // Plain JSON: it came from a parsed request body.
        options: options as Prisma.InputJsonObject,
      },
    });
    await tx.artifact.createMany({
      data: inputs.map((input) => ({
        id: newId("artifact"),
        orgId: actor.orgId,
        runId: id,
        kind: input.kind,
        sha256: input.file.sha256,
        size: input.file.size,
        contentType: input.contentType,
        storageKey: artifactKey(actor.orgId, input.file.sha256),
        verifiedAt: known.has(input.file.sha256) ? now : null,
      })),
    });
  });
  return { id, queued };
}

const view = async (db: Db, id: string): Promise<RunView> =>
  runView(await db.run.findUniqueOrThrow({ where: { id }, include: { project: { select: { slug: true } } } }));

/**
 * Creates a server-side run: the platform's worker will compare the two contracts, with the traffic if there is
 * any (PLAN M6). The client uploads the files to the pre-signed URLs, then calls `complete`, which queues the run.
 * When every file is already in the organisation's storage, the run is queued at once.
 */
export async function createServerRun(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  projectSlug: string,
  idempotencyKeyHeader: string | null,
  body: unknown,
  start: StartRun,
  now = new Date()
): Promise<{ run: RunView; uploads: UploadView[]; replayed: boolean }> {
  if (!can(actor, "runs:write")) throw forbidden();
  if (idempotencyKeyHeader === null) throw badRequest("Idempotency-Key: the header is required");
  const idempotencyKey = parse(IdempotencyKey, idempotencyKeyHeader);
  const input = parse(ServerRunCreate, body);
  const policy = checkedPolicy(input.policy);
  const rules = checkedRules(input.rules);
  const project = await findProject(db, actor, projectSlug);
  const requestHash = sha256Hex(canonicalJson({ ...input, project: project.slug }));

  const replay = async () => {
    const existing = await db.run.findUnique({
      where: { orgId_idempotencyKey: { orgId: actor.orgId, idempotencyKey } },
    });
    if (!existing) return undefined;
    if (existing.requestHash !== requestHash)
      throw conflict("This Idempotency-Key was already used with a different request.");
    return { run: await view(db, existing.id), uploads: await uploadsFor(db, store, existing.id), replayed: true };
  };
  const replayed = await replay();
  if (replayed) return replayed;

  const options: RunOptions = {
    base: { name: input.base.name },
    head: { name: input.head.name },
    ...(input.traffic ? { traffic: { name: input.traffic.name, format: input.traffic.format } } : {}),
    ...(policy ? { policy } : {}),
    ...(rules ? { rules } : {}),
    ...(input.failOn === undefined ? {} : { failOn: input.failOn }),
    ...(input.seed === undefined ? {} : { seed: input.seed }),
  };
  const inputs: Input[] = [
    { kind: "input-base", file: input.base, contentType: "application/yaml" },
    { kind: "input-head", file: input.head, contentType: "application/yaml" },
    ...(input.traffic
      ? [
          {
            kind: "input-traffic" as const,
            file: input.traffic,
            contentType: input.traffic.format === "har" ? "application/json" : "application/x-ndjson",
          },
        ]
      : []),
  ];
  let created: { id: string; queued: boolean };
  try {
    created = await createRunWithInputs(
      db,
      actor,
      {
        projectId: project.id,
        trigger: input.trigger.toUpperCase() as "CI" | "MANUAL" | "APP",
        idempotencyKey,
        requestHash,
        commit: input.commit,
        branch: input.branch ?? null,
        pullRequest: input.pullRequest ?? null,
        createdByKeyId: actor.kind === "key" ? actor.keyId : null,
      },
      options,
      inputs,
      now
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      const other = await replay();
      if (other) return other;
    }
    throw error;
  }
  if (created.queued) await start({ id: created.id, orgId: actor.orgId });
  return { run: await view(db, created.id), uploads: await uploadsFor(db, store, created.id), replayed: false };
}

/**
 * Re-runs a server-side run with a new corpus, policy, rules, fail-on or seed. The result is a **child run** (its
 * `parentRunId` is the original): the contracts are the same files, so the stages whose inputs did not change
 * (Ingest and Diff, and more when only the policy changed) come from the organisation's stage cache.
 */
export async function rerun(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  runId: string,
  body: unknown,
  start: StartRun,
  now = new Date()
): Promise<{ run: RunView; uploads: UploadView[] }> {
  if (!can(actor, "runs:write")) throw forbidden();
  const parent = await ownRun(db, actor, runId);
  if (parent.mode !== "SERVER")
    throw conflict("Only a server-side run can be re-run: an uploaded report has no stored inputs.");
  const input = parse(RerunCreate, body);
  const policy = checkedPolicy(input.policy);
  const rules = checkedRules(input.rules);
  const previous = RunOptions.parse(parent.options);
  const files = await db.artifact.findMany({ where: { runId: parent.id, kind: { startsWith: "input-" } } });
  const inherited = (kind: Input["kind"]): Input | undefined => {
    const artifact = files.find((file) => file.kind === kind);
    return (
      artifact && {
        kind,
        contentType: artifact.contentType,
        file: { name: "", sha256: artifact.sha256, size: artifact.size },
      }
    );
  };
  const base = inherited("input-base");
  const head = inherited("input-head");
  if (!base || !head) throw conflict("The run being re-run has no stored contracts.");
  const traffic: Input | undefined =
    input.traffic === undefined
      ? inherited("input-traffic")
      : input.traffic === null
        ? undefined
        : {
            kind: "input-traffic",
            file: input.traffic,
            contentType: input.traffic.format === "har" ? "application/json" : "application/x-ndjson",
          };

  const trafficOptions =
    input.traffic === undefined
      ? previous.traffic
      : input.traffic === null
        ? undefined
        : { name: input.traffic.name, format: input.traffic.format };
  const nextPolicy = policy ?? previous.policy;
  const nextRules = (rules as Record<string, unknown> | undefined) ?? previous.rules;
  const failOn = input.failOn ?? previous.failOn;
  const seed = input.seed ?? previous.seed;
  const options: RunOptions = {
    base: previous.base,
    head: previous.head,
    ...(trafficOptions ? { traffic: trafficOptions } : {}),
    ...(nextPolicy ? { policy: nextPolicy } : {}),
    ...(nextRules ? { rules: nextRules } : {}),
    ...(failOn === undefined ? {} : { failOn }),
    ...(seed === undefined ? {} : { seed }),
  };
  const id = newId("run");
  const created = await createRunWithInputs(
    db,
    actor,
    {
      projectId: parent.projectId,
      trigger: "MANUAL",
      // A re-run is asked for once; its key only has to be unique.
      idempotencyKey: `rerun:${id}`,
      requestHash: sha256Hex(canonicalJson({ parent: parent.id, ...input })),
      commit: parent.commit,
      branch: parent.branch,
      pullRequest: parent.pullRequest,
      parentRunId: parent.id,
      createdByKeyId: actor.kind === "key" ? actor.keyId : null,
    },
    options,
    [base, head, ...(traffic ? [traffic] : [])],
    now
  );
  if (created.queued) await start({ id: created.id, orgId: actor.orgId });
  return { run: await view(db, created.id), uploads: await uploadsFor(db, store, created.id) };
}

export interface StageView {
  stage: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  /** True when the stage's output was reused from the cache instead of computed. */
  cacheHit: boolean;
  attempt: number;
  startedAt?: string;
  finishedAt?: string;
}

const STAGE_ORDER = ["ingest.base", "ingest.head", "diff", "corpus", "verify", "classify"];

/** The run's stages, in pipeline order, each as of its latest attempt. */
export async function listStages(db: Db, actor: Actor, runId: string): Promise<StageView[]> {
  if (!can(actor, "runs:read")) throw forbidden();
  const run = await ownRun(db, actor, runId);
  const rows = await db.stageExecution.findMany({
    where: { runId: run.id, orgId: actor.orgId },
    orderBy: { attempt: "asc" },
  });
  const latest = new Map(rows.map((row) => [row.stage, row]));
  return [...latest.values()]
    .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
    .map((row) => ({
      stage: row.stage,
      status: row.status.toLowerCase() as StageView["status"],
      cacheHit: row.cacheHit,
      attempt: row.attempt,
      ...(row.startedAt === null ? {} : { startedAt: row.startedAt.toISOString() }),
      ...(row.finishedAt === null ? {} : { finishedAt: row.finishedAt.toISOString() }),
    }));
}
