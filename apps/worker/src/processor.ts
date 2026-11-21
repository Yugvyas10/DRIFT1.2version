import { createHash } from "node:crypto";
import { MessageChannel } from "node:worker_threads";
import { DEFAULT_POLICY, parseRuleset, Policy, renderReport, type Ruleset } from "@drift/core";
import { newId, type Db } from "@drift/db";
import {
  artifactKey,
  context,
  describeError,
  extractTraceContext,
  publishRunEvent,
  RunJob,
  SpanStatusCode,
  trace,
  tracer,
  type Logger,
  type ObjectStore,
  type Redis,
  type S3Settings,
  type Semaphore,
} from "@drift/platform";
import type { Report } from "@drift/report-schema";
import { z } from "zod";
import { duration } from "./duration.ts";
import type { EngineResult, EngineTask, StageMessage } from "./engine-task.ts";

/** The engine, somewhere else (a piscina thread). `signal` stops it when the run's time is up. */
export type RunEngine = (task: EngineTask, signal: AbortSignal) => Promise<EngineResult>;

export interface ProcessorDeps {
  db: Db;
  redis: Redis;
  store: ObjectStore;
  s3: S3Settings;
  semaphore: Semaphore;
  engine: RunEngine;
  log: Logger;
  runTimeoutMs: number;
  /** How long a job that found its organisation at its limit waits before trying again. */
  busyDelayMs?: number;
  now?: () => Date;
}

/** What the queue tells the processor about the job, and how the processor answers. */
export interface JobContext {
  id: string;
  data: unknown;
  /** Attempts already made that failed (0 on the first try). */
  attemptsMade: number;
  /** Attempts allowed in total. */
  attempts: number;
  /** Puts the job back for later without counting an attempt (the organisation is at its limit). */
  delay(ms: number): Promise<never>;
}

/** A failure a retry cannot fix. The queue does not retry it. */
export class PermanentFailure extends Error {
  readonly category: string;
  constructor(category: string, message: string) {
    super(message);
    this.name = "PermanentFailure";
    this.category = category;
  }
}

const Options = z.object({
  base: z.object({ name: z.string() }),
  head: z.object({ name: z.string() }),
  traffic: z.object({ name: z.string(), format: z.enum(["jsonl", "har"]) }).optional(),
  policy: Policy.optional(),
  rules: z.unknown().optional(),
  failOn: z.enum(["breaking", "risky"]).optional(),
  seed: z.number().int().optional(),
});

/**
 * The policy a run is classified with:
 *
 * - the run's own policy (`--policy`, or the API's `policy`), else the project's stored policy (set on the
 *   project's settings page), else the engine's default;
 * - plus the project's stored suppressions (`POST .../suppressions`, or "Suppress this change"): each accepts one
 *   change id until its expiry, with its reason, exactly like a suppression in a policy file. Expired ones are
 *   ignored by Classify and reported.
 */
async function effectivePolicy(
  db: Db,
  run: { orgId: string; projectId: string },
  policy: Policy | undefined
): Promise<Policy | undefined> {
  const [projectPolicy, stored] = await Promise.all([
    policy
      ? Promise.resolve(undefined)
      : db.policy.findFirst({ where: { orgId: run.orgId, projectId: run.projectId }, orderBy: { createdAt: "desc" } }),
    db.suppression.findMany({ where: { orgId: run.orgId, projectId: run.projectId }, orderBy: { createdAt: "asc" } }),
  ]);
  const chosen = policy ?? (projectPolicy ? Policy.parse(projectPolicy.document) : undefined);
  if (stored.length === 0) return chosen;
  const base = chosen ?? DEFAULT_POLICY;
  return {
    ...base,
    suppressions: [
      ...(base.suppressions ?? []),
      ...stored.map((row) => ({
        changeId: row.changeId,
        reason: row.reason,
        expiresAt: row.expiresAt.toISOString().slice(0, 10),
      })),
    ],
  };
}

const REPORT_ARTIFACTS = [
  { kind: "report-json", format: "json", contentType: "application/json" },
  { kind: "report-md", format: "md", contentType: "text/markdown" },
  { kind: "report-html", format: "html", contentType: "text/html" },
  { kind: "report-sarif", format: "sarif", contentType: "application/sarif+json" },
] as const;

/** How long to wait for the engine's last stage messages after it returned or was stopped. */
const END_WAIT_MS = 1000;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Processes one queued server-side run (PLAN M6).
 *
 * - **Per-organisation limit:** takes a slot of the organisation's semaphore, or puts the job back for later
 *   without using up an attempt. The slot is a lease that this process keeps renewing; if the process dies the
 *   lease runs out and the slot frees itself.
 * - **Progress:** every stage start and finish becomes a StageExecution row, a run event (Redis Stream and
 *   pub/sub, for the SSE endpoint) and a span under the trace of the request that queued the run.
 * - **Result:** the report and its renderings go to object storage; the run row, its changes and evidence
 *   summaries come from the report, exactly as for an uploaded run.
 * - **Failure:** invalid inputs and timeouts are permanent (no retry). Anything else is retried by the queue
 *   with backoff; the run is `failed` only after the last attempt.
 *
 * Processing the same run twice (a retry after a crash) is safe: rows are written per attempt, and results
 * replace earlier partial ones.
 */
export async function processRun(job: JobContext, deps: ProcessorDeps): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const parsed = RunJob.safeParse(job.data);
  if (!parsed.success) throw new PermanentFailure("invalid_job", "The job does not name a run.");
  const { runId, orgId, trace: carrier } = parsed.data;
  const log = deps.log.child({ runId, orgId, jobId: job.id });
  const event = (body: Parameters<typeof publishRunEvent>[2]) => publishRunEvent(deps.redis, runId, body);

  const run = await deps.db.run.findFirst({ where: { id: runId, orgId, mode: "SERVER" } });
  if (!run) {
    log.warn({}, "queued run not found; dropped");
    return;
  }
  if (run.status === "COMPLETE" || run.status === "FAILED") return; // already settled (a duplicate delivery)

  if (!(await deps.semaphore.acquire(orgId, job.id))) {
    log.info({}, "organisation at its concurrency limit; run delayed");
    return job.delay(deps.busyDelayMs ?? 2000);
  }
  // Renew the lease while the run is in progress, well inside its lifetime.
  const renew = setInterval(() => void deps.semaphore.acquire(orgId, job.id).catch(() => undefined), 5000);

  const span = tracer().startSpan("run", { attributes: { "drift.run.id": runId } }, extractTraceContext(carrier));
  const spanContext = trace.setSpan(context.active(), span);
  const attempt = run.attempts + 1;
  const startedAt = now();
  try {
    await deps.db.run.update({ where: { id: runId }, data: { status: "RUNNING", attempts: attempt, startedAt } });
    // Stages an earlier attempt left running were cut short: its worker died.
    await deps.db.stageExecution.updateMany({
      where: { runId, status: "RUNNING" },
      data: { status: "FAILED", finishedAt: startedAt },
    });
    await event({ type: "run.started", at: startedAt.toISOString(), attempt });
    log.info({ attempt }, "run started");

    const parsed = Options.safeParse(run.options);
    if (!parsed.success) throw new PermanentFailure("invalid_input", "The run's options are not valid.");
    const options = parsed.data;
    let ruleset: Ruleset | undefined;
    try {
      ruleset = options.rules === undefined ? undefined : parseRuleset(options.rules);
    } catch {
      throw new PermanentFailure("invalid_input", "The run's ruleset is not a valid drift-rules/v1 document.");
    }
    const policy = await effectivePolicy(deps.db, run, options.policy);
    const inputs = await deps.db.artifact.findMany({ where: { runId, orgId, kind: { startsWith: "input-" } } });
    const input = (kind: string) => inputs.find((artifact) => artifact.kind === kind);
    const base = input("input-base");
    const head = input("input-head");
    const traffic = input("input-traffic");
    if (!base || !head) throw new PermanentFailure("invalid_input", "The run has no contracts to compare.");

    // Stage progress from the engine's thread: rows, events and spans, in the order they arrive.
    const { port1, port2 } = new MessageChannel();
    const spans = new Map<
      string,
      { span: ReturnType<ReturnType<typeof tracer>["startSpan"]>; at: Date; row: string }
    >();
    let chain: Promise<void> = Promise.resolve();
    let ended!: () => void;
    const end = new Promise<void>((resolve) => {
      ended = resolve;
    });
    port1.on("message", (message: StageMessage) => {
      if (message.status === "end") {
        ended();
        return;
      }
      chain = chain.then(async () => {
        const at = now();
        if (message.status === "started") {
          const row = newId("stage");
          spans.set(message.stage, { span: tracer().startSpan(`stage ${message.stage}`, {}, spanContext), at, row });
          await deps.db.stageExecution.create({
            data: {
              id: row,
              orgId,
              runId,
              stage: message.stage,
              attempt,
              status: "RUNNING",
              cacheKey: "",
              cacheHit: false,
              startedAt: at,
            },
          });
          await event({ type: "stage.started", at: at.toISOString(), attempt, stage: message.stage });
          return;
        }
        const open = spans.get(message.stage);
        const durationMs = open ? at.getTime() - open.at.getTime() : 0;
        open?.span.setAttribute("drift.cache_hit", message.cacheHit);
        open?.span.end();
        if (open) {
          await deps.db.stageExecution.update({
            where: { id: open.row },
            data: { status: "SUCCEEDED", cacheKey: message.hash, cacheHit: message.cacheHit, finishedAt: at },
          });
        }
        await event({
          type: "stage.finished",
          at: at.toISOString(),
          attempt,
          stage: message.stage,
          cacheHit: message.cacheHit,
          durationMs,
        });
        log.info({ stage: message.stage, cacheHit: message.cacheHit, durationMs }, "stage finished");
      });
    });

    const timeout = AbortSignal.timeout(deps.runTimeoutMs);
    let result: EngineResult;
    try {
      result = await deps.engine(
        {
          orgId,
          s3: deps.s3,
          base: { key: base.storageKey, name: options.base.name, sha256: base.sha256 },
          head: { key: head.storageKey, name: options.head.name, sha256: head.sha256 },
          ...(traffic && options.traffic
            ? {
                traffic: {
                  key: traffic.storageKey,
                  name: options.traffic.name,
                  sha256: traffic.sha256,
                  format: options.traffic.format,
                },
              }
            : {}),
          ...(policy ? { policy } : {}),
          ...(ruleset ? { ruleset } : {}),
          ...(options.failOn === undefined ? {} : { failOn: options.failOn }),
          ...(options.seed === undefined ? {} : { seed: options.seed }),
          asOf: startedAt.toISOString().slice(0, 10),
          port: port2,
        },
        timeout
      );
    } catch (error) {
      if (timeout.aborted) {
        throw new PermanentFailure(
          "timeout",
          `The run took longer than its time limit (${duration(deps.runTimeoutMs)}) and was stopped.`
        );
      }
      throw error;
    } finally {
      // Handle every stage message the engine sent before it returned: they travel on their own channel, so they
      // can arrive after the result. An engine that was stopped (timeout) or crashed never sends "end".
      await Promise.race([end, new Promise((resolve) => setTimeout(resolve, END_WAIT_MS))]);
      await chain;
      port1.close();
      for (const open of spans.values()) open.span.end();
      await deps.db.stageExecution.updateMany({
        where: { runId, attempt, status: "RUNNING" },
        data: { status: "FAILED", finishedAt: now() },
      });
    }
    if (!result.ok) throw new PermanentFailure(result.category, result.message);

    await storeResult(deps, { runId, orgId }, result.report, now());
    const { gate, summary, semver } = result.report;
    await event({ type: "run.completed", at: now().toISOString(), gate, summary, semver });
    span.setStatus({ code: SpanStatusCode.OK });
    log.info({ gatePassed: gate.passed, ...summary }, "run completed");
  } catch (error) {
    const permanent = error instanceof PermanentFailure;
    const lastAttempt = job.attemptsMade + 1 >= job.attempts;
    const category = permanent ? error.category : "internal";
    // Only a PermanentFailure's message is written for users; anything else may contain internals.
    const message = permanent ? error.message : "The run failed unexpectedly.";
    span.setStatus({ code: SpanStatusCode.ERROR, message: category });
    log.error({ err: describeError(error), category, attempt, willRetry: !permanent && !lastAttempt }, "run failed");
    if (permanent || lastAttempt) {
      await deps.db.run.update({
        where: { id: runId },
        data: { status: "FAILED", errorCategory: category, errorMessage: message, completedAt: now() },
      });
      await event({ type: "run.failed", at: now().toISOString(), category, message, willRetry: false });
    } else {
      await deps.db.run.update({ where: { id: runId }, data: { status: "QUEUED" } });
      await event({ type: "run.failed", at: now().toISOString(), category, message, willRetry: true });
    }
    throw error;
  } finally {
    clearInterval(renew);
    span.end();
    await deps.semaphore.release(orgId, job.id).catch(() => undefined);
  }
}

/** Stores the report's files and writes the run's result rows, replacing anything an earlier attempt left. */
async function storeResult(
  deps: ProcessorDeps,
  run: { runId: string; orgId: string },
  report: Report,
  at: Date
): Promise<void> {
  const { runId, orgId } = run;
  const files = REPORT_ARTIFACTS.map((artifact) => {
    const content = renderReport(report, artifact.format);
    return { ...artifact, content, sha256: sha256(content), size: Buffer.byteLength(content) };
  });
  for (const file of files) await deps.store.putText(artifactKey(orgId, file.sha256), file.content, file.contentType);

  const changes = report.changes.map((change) => ({ row: newId("change"), change }));
  await deps.db.$transaction(async (tx) => {
    await tx.change.deleteMany({ where: { runId, orgId } });
    await tx.artifact.deleteMany({ where: { runId, orgId, kind: { startsWith: "report-" } } });
    await tx.artifact.createMany({
      data: files.map((file) => ({
        id: newId("artifact"),
        orgId,
        runId,
        kind: file.kind,
        sha256: file.sha256,
        size: file.size,
        contentType: file.contentType,
        storageKey: artifactKey(orgId, file.sha256),
        verifiedAt: at,
      })),
    });
    const json = await tx.artifact.findFirstOrThrow({ where: { runId, kind: "report-json" }, select: { id: true } });
    await tx.change.createMany({
      data: changes.map(({ row, change }) => ({
        id: row,
        orgId,
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
        orgId,
        changeRowId: row,
        status: change.evidence.status,
        checkedRecorded: change.evidence.checked.recorded,
        checkedSynthetic: change.evidence.checked.synthetic,
        failedRecorded: change.evidence.failed.recorded,
        failedSynthetic: change.evidence.failed.synthetic,
        unknown: change.evidence.unknown,
        artifactId: json.id,
      })),
    });
    await tx.run.update({
      where: { id: runId },
      data: {
        status: "COMPLETE",
        completedAt: at,
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
        errorCategory: null,
        errorMessage: null,
      },
    });
  });
}
