import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRunQueue, DEAD_QUEUE, RUN_QUEUE } from "@drift/platform";
import { Queue } from "bullmq";
import { afterAll, beforeAll, expect, it } from "vitest";
import { inject } from "vitest";
import {
  closeServices,
  events,
  petstore,
  queuedRun,
  seedOrg,
  services,
  settled,
  waitForEvent,
  type Services,
} from "../test/fixtures.ts";
import runEngine from "./engine-task.ts";
import { createRunWorker } from "./queue-worker.ts";

let s: Services;

beforeAll(async () => {
  s = services();
  for (const name of [RUN_QUEUE, DEAD_QUEUE]) {
    const queue = new Queue(name, { connection: s.redis });
    await queue.obliterate({ force: true });
    await queue.close();
  }
});

afterAll(() => closeServices(s));

it("recovers a run whose worker was killed mid-run: another worker retries it and completes it", async () => {
  const files = await petstore();
  const { orgId, projectId } = await seedOrg(s.db);
  const runId = await queuedRun(s, { orgId, projectId, base: files.v1, head: files.v2, traffic: files.traffic });
  const queue = createRunQueue(s.redis);
  await queue.enqueue({ runId, orgId, trace: {} });

  // A worker in another process takes the run and is killed outright while its first stage is running.
  const child = spawn(process.execPath, [fileURLToPath(new URL("../test/crashing-worker.ts", import.meta.url))], {
    env: {
      ...process.env,
      DATABASE_URL: inject("databaseUrl"),
      REDIS_URL: inject("redisUrl"),
      TEST_S3: JSON.stringify(inject("s3")),
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const exited = new Promise<NodeJS.Signals | null>((resolve) =>
    child.once("exit", (_code, signal) => {
      resolve(signal);
    })
  );
  await waitForEvent(s.redis, runId, (event) => event.type === "stage.started");
  child.kill("SIGKILL");
  expect(await exited).toBe("SIGKILL");
  expect((await s.db.run.findUniqueOrThrow({ where: { id: runId } })).status).toBe("RUNNING");

  // A healthy worker notices the job's lock has expired, takes it again, and finishes the run.
  const worker = createRunWorker({
    ...s,
    concurrency: 1,
    orgConcurrency: 2,
    runTimeoutMs: 60_000,
    lockDurationMs: 1000,
    engine: (task) => runEngine(task),
  });
  try {
    expect(await waitForEvent(s.redis, runId, settled)).toMatchObject({ type: "run.completed" });
  } finally {
    await worker.close();
    await queue.close();
  }

  const run = await s.db.run.findUniqueOrThrow({ where: { id: runId } });
  expect(run).toMatchObject({ status: "COMPLETE", attempts: 2 });
  const stages = await s.db.stageExecution.findMany({
    where: { runId },
    orderBy: [{ attempt: "asc" }, { startedAt: "asc" }],
  });
  expect(stages.map((row) => [row.attempt, row.stage, row.status])).toEqual([
    // The stage the killed worker was running is marked failed when the run is taken up again.
    [1, "ingest.base", "FAILED"],
    ...["ingest.base", "ingest.head", "diff", "corpus", "verify", "classify"].map((stage) => [2, stage, "SUCCEEDED"]),
  ]);
  const started = (await events(s.redis, runId)).filter((event) => event.type === "run.started");
  expect(started.map((event) => event.attempt)).toEqual([1, 2]);
});
