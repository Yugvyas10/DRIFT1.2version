import { canonicalJson, sha256Hex } from "@drift/core";
import { newId, type Db, type Prisma } from "@drift/db";
import { Report } from "@drift/report-schema";
import { z } from "zod";
import { can, type Actor } from "../auth/actor";
import { badRequest, conflict, forbidden, notFound, parse } from "../http";
import { artifactKey, type ObjectStore } from "@drift/platform";
import { isUniqueViolation } from "./orgs";
import { findProject } from "./projects";
import { Slug } from "./schemas";

/** Largest body of `POST /api/v1/runs` (the report is inline; artifacts are uploaded separately). */
export const MAX_RUN_BODY_BYTES = 8 * 1024 * 1024;
/** Largest single artifact (also in drift-api.yaml). */
export const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

export const ARTIFACT_KINDS = [
  "report-json",
  "report-md",
  "report-html",
  "report-sarif",
  "report-junit",
  "stage-output",
] as const;

const ArtifactIntent = z.strictObject({
  kind: z.enum(ARTIFACT_KINDS),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().min(1).max(MAX_ARTIFACT_BYTES),
  contentType: z.string().min(1).max(100),
});

/** The body of `POST /api/v1/runs`, except `report`, which is validated separately (422, not 400). */
export const RunCreate = z.strictObject({
  project: Slug,
  trigger: z.enum(["ci", "manual", "app"]),
  commit: z.string().regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/),
  branch: z.string().min(1).max(255).optional(),
  pullRequest: z.number().int().min(1).optional(),
  report: z.unknown(),
  artifacts: z
    .array(ArtifactIntent)
    .max(20)
    .refine((list) => new Set(list.map((a) => a.kind)).size === list.length, "Each kind may appear once")
    .default([]),
});

export const IdempotencyKey = z
  .string()
  .min(8)
  .max(255)
  .regex(/^[A-Za-z0-9._:/-]+$/);

export interface RunView {
  id: string;
  project: string;
  status: "uploading" | "queued" | "running" | "complete" | "failed";
  /** `upload`: the report was uploaded. `server`: the platform's worker ran the engine. */
  mode: "upload" | "server";
  trigger: "ci" | "manual" | "app";
  commit: string;
  branch?: string;
  pullRequest?: number;
  /** The result. Absent until a server-side run has finished. */
  gate?: { passed: boolean; failOn: string };
  summary?: { breaking: number; risky: number; safe: number; suppressed: number };
  semver?: string;
  /** The run this one re-runs. */
  parentRunId?: string;
  /** Why a run failed. */
  error?: { category: string; message: string };
  createdAt: string;
  completedAt?: string;
}

export interface UploadView {
  kind: string;
  sha256: string;
  url: string;
  expiresAt: string;
}

type RunRow = Prisma.RunGetPayload<{ include: { project: { select: { slug: true } } } }>;

const lower = <T extends string>(value: T) => value.toLowerCase() as Lowercase<T>;

export function runView(row: RunRow): RunView {
  return {
    id: row.id,
    project: row.project.slug,
    status: lower(row.status),
    mode: lower(row.mode),
    trigger: lower(row.trigger),
    commit: row.commit,
    ...(row.branch === null ? {} : { branch: row.branch }),
    ...(row.pullRequest === null ? {} : { pullRequest: row.pullRequest }),
    ...(row.gatePassed === null || row.failOn === null ? {} : { gate: { passed: row.gatePassed, failOn: row.failOn } }),
    ...(row.breaking === null || row.risky === null || row.safe === null || row.suppressed === null
      ? {}
      : { summary: { breaking: row.breaking, risky: row.risky, safe: row.safe, suppressed: row.suppressed } }),
    ...(row.semver === null ? {} : { semver: row.semver }),
    ...(row.parentRunId === null ? {} : { parentRunId: row.parentRunId }),
    ...(row.errorCategory === null ? {} : { error: { category: row.errorCategory, message: row.errorMessage ?? "" } }),
    createdAt: row.createdAt.toISOString(),
    ...(row.completedAt === null ? {} : { completedAt: row.completedAt.toISOString() }),
  };
}

export async function uploadsFor(db: Db, store: ObjectStore, runId: string): Promise<UploadView[]> {
  const pending = await db.artifact.findMany({ where: { runId, verifiedAt: null }, orderBy: { kind: "asc" } });
  return Promise.all(
    pending.map(async (artifact) => {
      const signed = await store.presignPut(artifact.storageKey, artifact.contentType);
      return {
        kind: artifact.kind,
        sha256: artifact.sha256,
        url: signed.url,
        expiresAt: signed.expiresAt.toISOString(),
      };
    })
  );
}

/**
 * Creates a run from an uploaded report (PLAN M5).
 * - **Idempotent:** the same `Idempotency-Key` with the same body returns the run made the first time
 *   (`replayed: true`); the same key with a different body is a 409.
 * - The report must be a valid drift-report/v1 document (422 otherwise): the stored run, its stage rows, changes
 *   and evidence summaries all come from it, never from other client-supplied fields.
 * - Every announced artifact gets a pre-signed PUT URL under the organisation's own prefix. An artifact this
 *   organisation already stored (same SHA-256, verified) is reused and needs no upload.
 */
export async function createRun(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  idempotencyKeyHeader: string | null,
  body: unknown,
  now = new Date()
): Promise<{ run: RunView; uploads: UploadView[]; replayed: boolean }> {
  if (!can(actor, "runs:write")) throw forbidden();
  if (idempotencyKeyHeader === null) throw badRequest("Idempotency-Key: the header is required");
  const idempotencyKey = parse(IdempotencyKey, idempotencyKeyHeader);
  const input = parse(RunCreate, body);
  const report = parse(Report, input.report, 422);
  const project = await findProject(db, actor, input.project);
  const requestHash = sha256Hex(canonicalJson(input));

  const replay = async () => {
    const existing = await db.run.findUnique({
      where: { orgId_idempotencyKey: { orgId: actor.orgId, idempotencyKey } },
      include: { project: { select: { slug: true } } },
    });
    if (!existing) return undefined;
    if (existing.requestHash !== requestHash) {
      throw conflict("This Idempotency-Key was already used with a different request.");
    }
    return { run: runView(existing), uploads: await uploadsFor(db, store, existing.id), replayed: true };
  };
  const replayed = await replay();
  if (replayed) return replayed;

  const runId = newId("run");
  const reused = new Set(
    (
      await db.artifact.findMany({
        where: { orgId: actor.orgId, sha256: { in: input.artifacts.map((a) => a.sha256) }, verifiedAt: { not: null } },
        select: { sha256: true },
      })
    ).map((artifact) => artifact.sha256)
  );
  const complete = input.artifacts.every((artifact) => reused.has(artifact.sha256));
  const changes = report.changes.map((change) => ({ row: newId("change"), change }));
  try {
    await db.$transaction(async (tx) => {
      await tx.run.create({
        data: {
          id: runId,
          orgId: actor.orgId,
          projectId: project.id,
          status: complete ? "COMPLETE" : "UPLOADING",
          trigger: input.trigger.toUpperCase() as "CI" | "MANUAL" | "APP",
          idempotencyKey,
          requestHash,
          commit: input.commit,
          branch: input.branch ?? null,
          pullRequest: input.pullRequest ?? null,
          baseSpecHash: report.base.specHash,
          headSpecHash: report.head.specHash,
          engineVersion: report.engine.version,
          rulesVersion: report.rules.version,
          rulesHash: report.rules.hash,
          policyHash: report.policy.hash,
          gatePassed: report.gate.passed,
          failOn: report.gate.failOn,
          breaking: report.summary.breaking,
          risky: report.summary.risky,
          safe: report.summary.safe,
          suppressed: report.summary.suppressed,
          semver: report.semver,
          createdByKeyId: actor.kind === "key" ? actor.keyId : null,
          completedAt: complete ? now : null,
        },
      });
      await tx.stageExecution.createMany({
        data: report.stages.map((stage) => ({
          id: newId("stage"),
          orgId: actor.orgId,
          runId,
          stage: stage.stage,
          status: "SUCCEEDED" as const,
          cacheKey: stage.hash,
          cacheHit: stage.cached,
        })),
      });
      await tx.artifact.createMany({
        data: input.artifacts.map((artifact) => ({
          id: newId("artifact"),
          orgId: actor.orgId,
          runId,
          kind: artifact.kind,
          sha256: artifact.sha256,
          size: artifact.size,
          contentType: artifact.contentType,
          storageKey: artifactKey(actor.orgId, artifact.sha256),
          verifiedAt: reused.has(artifact.sha256) ? now : null,
        })),
      });
      await tx.change.createMany({
        data: changes.map(({ row, change }) => ({
          id: row,
          orgId: actor.orgId,
          runId,
          changeId: change.id,
          kind: change.kind,
          direction: change.direction,
          operation: change.operation,
          location: change.location,
          severity: change.severity,
          ruleId: change.ruleId,
          message: change.message,
          confidence: change.confidence,
          suppressed: change.suppression !== undefined,
        })),
      });
      await tx.evidence.createMany({
        data: changes.map(({ row, change }) => ({
          id: newId("evidence"),
          orgId: actor.orgId,
          changeRowId: row,
          status: change.evidence.status,
          checkedRecorded: change.evidence.checked.recorded,
          checkedSynthetic: change.evidence.checked.synthetic,
          failedRecorded: change.evidence.failed.recorded,
          failedSynthetic: change.evidence.failed.synthetic,
          unknown: change.evidence.unknown,
        })),
      });
    });
  } catch (error) {
    // Two requests with the same key raced: the other one created the run.
    if (isUniqueViolation(error)) {
      const other = await replay();
      if (other) return other;
    }
    throw error;
  }
  const created = await db.run.findUniqueOrThrow({
    where: { id: runId },
    include: { project: { select: { slug: true } } },
  });
  return { run: runView(created), uploads: await uploadsFor(db, store, runId), replayed: false };
}

/** A run of the actor's organisation; 404 otherwise, also for a key scoped to another project. */
export async function ownRun(db: Db, actor: Actor, runId: string): Promise<RunRow> {
  const run = await db.run.findFirst({
    where: { id: runId, orgId: actor.orgId },
    include: { project: { select: { slug: true } } },
  });
  if (!run) throw notFound();
  if (actor.kind === "key" && actor.projectId !== null && actor.projectId !== run.projectId) throw notFound();
  return run;
}

/** Queues a server-side run once its inputs are in storage (the queue and the run's first event). */
export type StartRun = (run: { id: string; orgId: string }) => Promise<void>;

/**
 * Marks a run's uploads as done. The server reads every announced artifact from storage itself and checks its
 * size and SHA-256: a client cannot claim an upload it did not make, or store something else under that hash.
 *
 * An uploaded report's run is then `complete`. A server-side run is `queued` for the worker instead.
 */
export async function completeRun(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  runId: string,
  start: StartRun,
  now = new Date()
): Promise<RunView> {
  if (!can(actor, "runs:write")) throw forbidden();
  const run = await ownRun(db, actor, runId);
  if (run.status !== "UPLOADING") return runView(run);
  const pending = await db.artifact.findMany({ where: { runId, verifiedAt: null }, orderBy: { kind: "asc" } });
  const problems: string[] = [];
  for (const artifact of pending) {
    const stored = await store.inspect(artifact.storageKey, artifact.size);
    if (!stored) problems.push(`${artifact.kind}: not uploaded`);
    else if (stored.size !== artifact.size || stored.sha256 !== artifact.sha256) {
      problems.push(`${artifact.kind}: does not match the announced size and SHA-256`);
    }
  }
  if (problems.length > 0) throw conflict(problems.join("; "));
  const server = run.mode === "SERVER";
  const updated = await db.$transaction(async (tx) => {
    await tx.artifact.updateMany({ where: { runId, verifiedAt: null }, data: { verifiedAt: now } });
    const report = await tx.artifact.findFirst({ where: { runId, kind: "report-json" }, select: { id: true } });
    if (report) {
      await tx.evidence.updateMany({
        where: { orgId: actor.orgId, change: { runId } },
        data: { artifactId: report.id },
      });
    }
    return tx.run.update({
      where: { id: runId },
      data: server ? { status: "QUEUED" } : { status: "COMPLETE", completedAt: now },
      include: { project: { select: { slug: true } } },
    });
  });
  if (server) await start({ id: updated.id, orgId: updated.orgId });
  return runView(updated);
}

export async function getRun(db: Db, actor: Actor, runId: string): Promise<RunView> {
  if (!can(actor, "runs:read")) throw forbidden();
  return runView(await ownRun(db, actor, runId));
}

/** The organisation a run belongs to, for routes that only know a run id (the caller is authorised afterwards). */
export async function orgOfRun(db: Db, runId: string): Promise<string> {
  const run = await db.run.findUnique({ where: { id: runId }, select: { orgId: true } });
  if (!run) throw notFound();
  return run.orgId;
}

const Cursor = z.string().max(200);

/** A project's runs, newest first, in pages. The cursor is opaque to clients. */
export async function listRuns(
  db: Db,
  actor: Actor,
  projectSlug: string,
  options: { cursor?: string | undefined; limit?: number | undefined }
): Promise<{ runs: RunView[]; nextCursor?: string }> {
  if (!can(actor, "runs:read")) throw forbidden();
  const project = await findProject(db, actor, projectSlug);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  let after: { createdAt: Date; id: string } | undefined;
  if (options.cursor !== undefined) {
    const [time, id] = Buffer.from(parse(Cursor, options.cursor), "base64url").toString("utf8").split("|");
    const createdAt = new Date(time ?? "");
    if (Number.isNaN(createdAt.getTime()) || !id) throw badRequest("cursor: not a cursor from a previous page");
    after = { createdAt, id };
  }
  const rows = await db.run.findMany({
    where: {
      orgId: actor.orgId,
      projectId: project.id,
      ...(after
        ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: { project: { select: { slug: true } } },
  });
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    runs: page.map(runView),
    ...(rows.length > limit && last
      ? { nextCursor: Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString("base64url") }
      : {}),
  };
}

/** A short-lived signed URL to read one verified artifact of a run. */
export async function artifactUrl(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  runId: string,
  kind: string
): Promise<{ url: string; expiresAt: string }> {
  if (!can(actor, "runs:read")) throw forbidden();
  const run = await ownRun(db, actor, runId);
  const artifact = await db.artifact.findUnique({ where: { runId_kind: { runId: run.id, kind } } });
  if (!artifact) throw notFound();
  // Announced but never uploaded (or not yet checked): there is nothing to hand out.
  if (artifact.verifiedAt === null) throw notFound();
  const signed = await store.presignGet(artifact.storageKey);
  return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
}
