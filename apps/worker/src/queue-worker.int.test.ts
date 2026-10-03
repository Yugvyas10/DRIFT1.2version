import { DEFAULT_RULESET } from "@drift/core";
import { newId } from "@drift/db";
import { createRunQueue, createSemaphore, DEAD_QUEUE, RUN_QUEUE, type RunQueue } from "@drift/platform";
import { UnrecoverableError } from "bullmq";
import { Queue } from "bullmq";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeServices,
  events,
  petstore,
  queuedRun,
  seedOrg,
  services,
  settled,
  waitForEvent,
  type InputFile,
  type Services,
} from "../test/fixtures.ts";
import runEngine, { type EngineTask } from "./engine-task.ts";
import type { RunEngine } from "./processor.ts";
import { createRunWorker, deadLetter, type RunWorker, type RunWorkerOptions } from "./queue-worker.ts";

let s: Services;
let queue: RunQueue;
let files: Awaited<ReturnType<typeof petstore>>;
let worker: RunWorker | undefined;
/** The run queue and the dead-letter queue, read directly. */
let runs: Queue;
let dead: Queue;

/** The engine in this thread instead of the pool, optionally wrapped (slow, failing, gated). */
const inProcess: RunEngine = (task) => runEngine(task);

/** Starts a worker; `pool: true` runs the engine in the piscina thread pool, as in production. */
function start(options: Partial<RunWorkerOptions> & { pool?: boolean } = {}): RunWorker {
  const { pool, ...rest } = options;
  worker = createRunWorker({
    db: s.db,
    redis: s.redis,
    store: s.store,
    s3: s.s3,
    log: s.log,
    concurrency: 2,
    orgConcurrency: 2,
    runTimeoutMs: 60_000,
    busyDelayMs: 100,
    ...(pool ? {} : { engine: inProcess }),
    ...rest,
  });
  return worker;
}

const enqueue = async (runId: string, orgId: string, target = queue) => {
  await target.enqueue({ runId, orgId, trace: {} });
  return runId;
};
const runRow = (id: string) => s.db.run.findUniqueOrThrow({ where: { id } });
const stageRows = (runId: string) =>
  s.db.stageExecution.findMany({ where: { runId }, orderBy: [{ attempt: "asc" }, { startedAt: "asc" }] });
const deadLetters = () => dead.getJobs(["waiting"]);

beforeAll(async () => {
  s = services();
  queue = createRunQueue(s.redis);
  runs = new Queue(RUN_QUEUE, { connection: s.redis });
  dead = new Queue(DEAD_QUEUE, { connection: s.redis });
  files = await petstore();
});

beforeEach(async () => {
  await runs.obliterate({ force: true });
  await dead.obliterate({ force: true });
});

afterEach(async () => {
  await worker?.close();
  worker = undefined;
});

afterAll(async () => {
  await queue.close();
  await runs.close();
  await dead.close();
  await closeServices(s);
});

describe("a server-side run", () => {
  it("runs in the engine thread: six stages, their rows and events, the report and its changes", async () => {
    start({ pool: true });
    const { orgId, projectId } = await seedOrg(s.db);
    const runId = await enqueue(
      await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2, traffic: files.traffic }),
      orgId
    );

    const last = await waitForEvent(s.redis, runId, settled);
    expect(last).toMatchObject({ type: "run.completed", gate: { passed: false, failOn: "breaking" }, semver: "major" });

    const run = await runRow(runId);
    expect(run).toMatchObject({ status: "COMPLETE", attempts: 1, gatePassed: false, errorCategory: null });
    expect(run.breaking).toBeGreaterThan(0);

    const stages = await stageRows(runId);
    expect(stages.map((row) => [row.stage, row.status, row.cacheHit, row.attempt])).toEqual([
      ["ingest.base", "SUCCEEDED", false, 1],
      ["ingest.head", "SUCCEEDED", false, 1],
      ["diff", "SUCCEEDED", false, 1],
      ["corpus", "SUCCEEDED", false, 1],
      ["verify", "SUCCEEDED", false, 1],
      ["classify", "SUCCEEDED", false, 1],
    ]);
    expect(stages.every((row) => /^[0-9a-f]{64}$/.test(row.cacheKey) && row.finishedAt !== null)).toBe(true);

    const timeline = await events(s.redis, runId);
    expect(
      timeline.map((event) =>
        event.type.startsWith("stage.") ? `${event.type} ${(event as { stage: string }).stage}` : event.type
      )
    ).toEqual([
      "run.started",
      ...["ingest.base", "ingest.head", "diff", "corpus", "verify", "classify"].flatMap((stage) => [
        `stage.started ${stage}`,
        `stage.finished ${stage}`,
      ]),
      "run.completed",
    ]);

    const artifacts = await s.db.artifact.findMany({ where: { runId }, orderBy: { kind: "asc" } });
    expect(artifacts.map((artifact) => artifact.kind)).toEqual([
      "input-base",
      "input-head",
      "input-traffic",
      "report-html",
      "report-json",
      "report-md",
      "report-sarif",
    ]);
    const json = artifacts.find((artifact) => artifact.kind === "report-json");
    const report = JSON.parse((await s.store.getText(json?.storageKey ?? "", 10_000_000)) ?? "{}") as {
      changes: unknown[];
      summary: { breaking: number };
    };
    expect(report.summary.breaking).toBe(run.breaking);
    expect(await s.db.change.count({ where: { runId } })).toBe(report.changes.length);
    expect(await s.db.evidence.count({ where: { orgId } })).toBe(report.changes.length);
    // Redaction holds on the server too: none of the fake secrets in the traffic reach a stored report.
    const stored = await s.store.getText(json?.storageKey ?? "", 10_000_000);
    expect(stored).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
    // The organisation's slot was given back.
    expect(await createSemaphore(s.redis, { limit: 2, leaseMs: 30_000 }).held(orgId)).toBe(0);
  });

  it("re-run with a new corpus reuses Ingest and Diff from the stage cache; the same inputs again reuse every stage", async () => {
    start();
    const { orgId, projectId } = await seedOrg(s.db);
    const parent = await enqueue(await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2 }), orgId);
    await waitForEvent(s.redis, parent, settled);

    const child = await enqueue(
      await queuedRun(s, {
        orgId,
        projectId,
        base: files.v1,
        head: files.v2,
        traffic: files.traffic,
        parentRunId: parent,
      }),
      orgId
    );
    await waitForEvent(s.redis, child, settled);
    const hits = async (runId: string) =>
      Object.fromEntries((await stageRows(runId)).map((row) => [row.stage, row.cacheHit]));
    expect(await hits(child)).toEqual({
      "ingest.base": true,
      "ingest.head": true,
      diff: true,
      corpus: false,
      verify: false,
      classify: false,
    });
    expect(
      (await events(s.redis, child)).filter((event) => event.type === "stage.finished" && event.cacheHit).length
    ).toBe(3);

    const again = await enqueue(
      await queuedRun(s, {
        orgId,
        projectId,
        base: files.v1,
        head: files.v2,
        traffic: files.traffic,
        parentRunId: parent,
      }),
      orgId
    );
    await waitForEvent(s.redis, again, settled);
    expect(Object.values(await hits(again))).toEqual([true, true, true, true, true, true]);
    expect((await runRow(again)).breaking).toBe((await runRow(child)).breaking);

    // The cache belongs to the organisation: another one comparing the same files computes everything.
    const other = await seedOrg(s.db);
    const elsewhere = await enqueue(await queuedRun(s, { ...other, base: files.v1, head: files.v2 }), other.orgId);
    await waitForEvent(s.redis, elsewhere, settled);
    expect(Object.values(await hits(elsewhere))).toEqual([false, false, false, false, false, false]);
  });
});

describe("re-running with new rules and stored suppressions", () => {
  it("reuses every stage before Classify, applies the new rules, and the project's suppressions", async () => {
    start();
    const { orgId, projectId } = await seedOrg(s.db);
    const parent = await enqueue(await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2 }), orgId);
    await waitForEvent(s.redis, parent, settled);
    const before = await runRow(parent);
    const accepted = await s.db.change.findFirstOrThrow({ where: { runId: parent, severity: "BREAKING" } });

    // Someone accepts one breaking change for this project (POST .../suppressions), with a reason and an expiry.
    await s.db.suppression.create({
      data: {
        id: newId("suppression"),
        orgId,
        projectId,
        changeId: accepted.changeId,
        reason: "Accepted: the only client was migrated in advance.",
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        createdById: newId("user"),
      },
    });
    const rules = { ...DEFAULT_RULESET, version: "9.9.9" };
    const child = await enqueue(
      await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2, parentRunId: parent, rules }),
      orgId
    );
    await waitForEvent(s.redis, child, settled);

    const hits = Object.fromEntries((await stageRows(child)).map((row) => [row.stage, row.cacheHit]));
    expect(hits).toEqual({
      "ingest.base": true,
      "ingest.head": true,
      diff: true,
      corpus: true,
      verify: true,
      classify: false,
    });
    const after = await runRow(child);
    expect(after).toMatchObject({ rulesVersion: "9.9.9", suppressed: 1, breaking: (before.breaking ?? 0) - 1 });
    expect(after.policyHash).not.toBe(before.policyHash);
    expect(await s.db.change.findFirstOrThrow({ where: { runId: child, changeId: accepted.changeId } })).toMatchObject({
      suppressed: true,
    });
  });

  it("uses the project's policy for a run without one, and the run's own policy over it", async () => {
    start();
    const { orgId, projectId } = await seedOrg(s.db);
    await s.db.policy.create({
      data: {
        id: newId("policy"),
        orgId,
        projectId,
        name: "project",
        document: { format: "drift-policy/v1", failOn: "risky" },
        hash: "0".repeat(64),
      },
    });
    const plain = await enqueue(await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2 }), orgId);
    const own = await enqueue(
      await queuedRun(s, {
        orgId,
        projectId,
        base: files.v1,
        head: files.v2,
        policy: { format: "drift-policy/v1", failOn: "breaking" },
      }),
      orgId
    );
    await waitForEvent(s.redis, plain, settled);
    await waitForEvent(s.redis, own, settled);
    expect((await runRow(plain)).failOn).toBe("risky");
    expect((await runRow(own)).failOn).toBe("breaking");
  });

  it("fails a run whose ruleset is not valid, without retrying it", async () => {
    start();
    const { orgId, projectId } = await seedOrg(s.db);
    const runId = await enqueue(
      await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2, rules: { format: "drift-rules/v1" } }),
      orgId
    );
    expect(await waitForEvent(s.redis, runId, settled)).toMatchObject({
      type: "run.failed",
      category: "invalid_input",
      message: "The run's ruleset is not a valid drift-rules/v1 document.",
      willRetry: false,
    });
  });
});

describe("failures", () => {
  it("an invalid contract fails the run at once, with a message for the user, and goes to the dead-letter queue", async () => {
    start({ pool: true });
    const { orgId, projectId } = await seedOrg(s.db);
    const broken: InputFile = { name: "broken.yaml", text: "openapi: 3.1.0\ninfo: [not, a, mapping\n" };
    const runId = await enqueue(await queuedRun(s, { orgId, projectId, base: files.v1, head: broken }), orgId);

    expect(await waitForEvent(s.redis, runId, settled)).toMatchObject({
      type: "run.failed",
      category: "invalid_spec",
      willRetry: false,
    });
    const run = await runRow(runId);
    expect(run).toMatchObject({ status: "FAILED", attempts: 1, errorCategory: "invalid_spec" });
    expect(run.errorMessage).toContain("The head contract (broken.yaml) is not a valid OpenAPI document");
    expect((await stageRows(runId)).map((row) => [row.stage, row.status])).toEqual([
      ["ingest.base", "SUCCEEDED"],
      ["ingest.head", "FAILED"],
    ]);
    await expect
      .poll(async () => (await deadLetters()).map((job) => job.data as unknown))
      .toEqual([expect.objectContaining({ runId, orgId, reason: expect.stringContaining("invalid_spec") as unknown })]);
    expect((await runs.getJob(runId))?.attemptsMade).toBe(1);
  });

  it("a run over its time limit is stopped and failed, not retried", async () => {
    const hang: RunEngine = (_task, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(signal.reason as Error);
        });
      });
    start({ engine: hang, runTimeoutMs: 300 });
    const { orgId, projectId } = await seedOrg(s.db);
    const runId = await enqueue(await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2 }), orgId);

    expect(await waitForEvent(s.redis, runId, settled)).toMatchObject({
      type: "run.failed",
      category: "timeout",
      message: "The run took longer than its time limit (300 ms) and was stopped.",
      willRetry: false,
    });
    expect(await runRow(runId)).toMatchObject({ status: "FAILED", errorCategory: "timeout", attempts: 1 });
    await expect.poll(async () => (await deadLetters()).length).toBe(1);
  });

  it("a transient failure is retried with backoff, and the retry completes the run", async () => {
    let calls = 0;
    start({
      engine: (task, signal) => {
        calls += 1;
        if (calls === 1) {
          task.port.close();
          return Promise.reject(new Error("ECONNRESET talking to storage, at /internal/path"));
        }
        return inProcess(task, signal);
      },
    });
    const { orgId, projectId } = await seedOrg(s.db);
    const runId = await enqueue(await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2 }), orgId);

    await waitForEvent(s.redis, runId, settled);
    const timeline = await events(s.redis, runId);
    expect(timeline.filter((event) => event.type === "run.failed")).toEqual([
      // Internal details stay in the logs; users see a generic message.
      expect.objectContaining({ category: "internal", message: "The run failed unexpectedly.", willRetry: true }),
    ]);
    expect(
      timeline.filter((event) => event.type === "run.started").map((event) => (event as { attempt: number }).attempt)
    ).toEqual([1, 2]);
    expect(timeline.at(-1)?.type).toBe("run.completed");
    expect(await runRow(runId)).toMatchObject({ status: "COMPLETE", attempts: 2 });
    expect(await deadLetters()).toEqual([]);
  });

  it("after the last attempt the run fails for good and goes to the dead-letter queue", async () => {
    start({ engine: () => Promise.reject(new Error("storage unavailable")) });
    const fast = createRunQueue(s.redis, { attempts: 2, backoff: { type: "fixed", delay: 50 } });
    const { orgId, projectId } = await seedOrg(s.db);
    const runId = await enqueue(await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2 }), orgId, fast);

    await waitForEvent(s.redis, runId, settled);
    expect((await events(s.redis, runId)).filter((event) => event.type === "run.failed")).toEqual([
      expect.objectContaining({ willRetry: true }),
      expect.objectContaining({ willRetry: false, category: "internal" }),
    ]);
    expect(await runRow(runId)).toMatchObject({ status: "FAILED", attempts: 2, errorCategory: "internal" });
    await expect
      .poll(async () => (await deadLetters()).map((job) => job.data as unknown))
      .toEqual([expect.objectContaining({ runId, reason: "storage unavailable" })]);
    await fast.close();
  });
});

describe("scheduling", () => {
  it("keeps an organisation to its concurrency limit without holding up other organisations", async () => {
    // Each organisation's runs wait at its gate until the test opens it.
    const gates = new Map<string, { open: () => void; opened: Promise<void> }>();
    const gate = (orgId: string) => {
      let entry = gates.get(orgId);
      if (!entry) {
        let open!: () => void;
        const opened = new Promise<void>((resolve) => {
          open = resolve;
        });
        entry = { open, opened };
        gates.set(orgId, entry);
      }
      return entry;
    };
    const gated: RunEngine = async (task: EngineTask, signal) => {
      await gate(task.orgId).opened;
      return inProcess(task, signal);
    };
    start({ engine: gated, concurrency: 3, orgConcurrency: 1 });
    const a = await seedOrg(s.db);
    const b = await seedOrg(s.db);
    const first = await enqueue(await queuedRun(s, { ...a, base: files.v1, head: files.v2 }), a.orgId);
    await waitForEvent(s.redis, first, (event) => event.type === "run.started");
    const second = await enqueue(await queuedRun(s, { ...a, base: files.v1, head: files.v2 }), a.orgId);
    const other = await enqueue(await queuedRun(s, { ...b, base: files.v1, head: files.v2 }), b.orgId);

    // Organisation B's run starts although A's second run is still waiting for A's only slot.
    await waitForEvent(s.redis, other, (event) => event.type === "run.started");
    expect((await runRow(second)).status).toBe("QUEUED");
    expect(await events(s.redis, second)).toEqual([]);

    gate(b.orgId).open();
    await waitForEvent(s.redis, other, settled);
    expect((await runRow(second)).status).toBe("QUEUED");

    gate(a.orgId).open();
    await waitForEvent(s.redis, first, settled);
    expect(await waitForEvent(s.redis, second, settled)).toMatchObject({ type: "run.completed" });
    // A delay is not a failed attempt.
    expect((await runRow(second)).attempts).toBe(1);
  });

  it("ignores a job whose run is already settled or does not exist (a duplicate delivery)", async () => {
    start();
    const { orgId, projectId } = await seedOrg(s.db);
    const done = await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2 });
    await s.db.run.update({ where: { id: done }, data: { status: "COMPLETE" } });
    await enqueue(done, orgId);
    await enqueue("run_00000000000000000000missing", orgId);
    await expect
      .poll(async () => [await runs.getJobState(done), await runs.getJobState("run_00000000000000000000missing")])
      .toEqual(["completed", "completed"]);
    expect(await events(s.redis, done)).toEqual([]);
    expect(await s.db.stageExecution.count({ where: { runId: done } })).toBe(0);
  });

  it("sends a job that names no run straight to the dead-letter queue", async () => {
    start();
    await runs.add("run", { runId: "not-a-run" }, { attempts: 3 });
    await expect
      .poll(async () => (await deadLetters()).map((job) => job.data as unknown))
      .toEqual([expect.objectContaining({ reason: "invalid_job: The job does not name a run." })]);
    expect((await deadLetters())[0]?.data).not.toHaveProperty("runId");
  });
});

describe("deadLetter", () => {
  it("settles a run the queue gave up on, and leaves runs that are settled alone", async () => {
    const { orgId, projectId } = await seedOrg(s.db);
    const stuck = await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2 });
    await s.db.run.update({ where: { id: stuck }, data: { status: "RUNNING", attempts: 3 } });
    const deps = { db: s.db, redis: s.redis, dead: dead, log: s.log };
    const stalled = new Error("job stalled more than allowable limit");

    // Not the last attempt: nothing happens yet.
    await deadLetter(deps, { data: { runId: stuck, orgId }, attemptsMade: 1, opts: { attempts: 3 } }, stalled);
    expect(await deadLetters()).toEqual([]);

    await deadLetter(deps, { data: { runId: stuck, orgId }, attemptsMade: 3, opts: { attempts: 3 } }, stalled);
    expect(await runRow(stuck)).toMatchObject({ status: "FAILED", errorCategory: "internal" });
    expect(await events(s.redis, stuck)).toEqual([
      expect.objectContaining({
        type: "run.failed",
        willRetry: false,
        message: "The run could not be completed after several attempts.",
      }),
    ]);

    // An unrecoverable failure is final on any attempt; a settled run keeps its own outcome.
    const done = await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2 });
    await s.db.run.update({ where: { id: done }, data: { status: "FAILED", errorCategory: "timeout" } });
    await deadLetter(
      deps,
      { data: { runId: done, orgId }, attemptsMade: 1, opts: {} },
      new UnrecoverableError("timeout: slow")
    );
    expect(await runRow(done)).toMatchObject({ errorCategory: "timeout" });
    expect(await events(s.redis, done)).toEqual([]);
    expect((await deadLetters()).map((job) => (job.data as { runId: string }).runId).sort()).toEqual(
      [done, stuck].sort()
    );
  });
});
