import { fileURLToPath } from "node:url";
import {
  createSemaphore,
  DEAD_QUEUE,
  describeError,
  publishRunEvent,
  RUN_QUEUE,
  RunJob,
  type Logger,
  type ObjectStore,
  type Redis,
  type S3Settings,
} from "@drift/platform";
import type { Db } from "@drift/db";
import { DelayedError, Queue, UnrecoverableError, Worker, type Job } from "bullmq";
import { Piscina } from "piscina";
import type { EngineResult, EngineTask } from "./engine-task.ts";
import { PermanentFailure, processRun, type RunEngine } from "./processor.ts";

export interface RunWorkerOptions {
  db: Db;
  redis: Redis;
  store: ObjectStore;
  s3: S3Settings;
  log: Logger;
  concurrency: number;
  orgConcurrency: number;
  runTimeoutMs: number;
  /** How long a job's lock lasts without renewal: a job whose worker died is retried after about this long. */
  lockDurationMs?: number;
  busyDelayMs?: number;
  /** The engine, instead of the piscina pool (tests that need a slow or failing engine). */
  engine?: RunEngine;
}

export interface RunWorker {
  /** Stops taking jobs, waits for the ones in progress, and closes the pool and the connections it opened. */
  close(): Promise<void>;
}

/** The semaphore lease: a dead worker's slot frees itself after this long. Renewed every 5 s while a run is live. */
const LEASE_MS = 30_000;

/**
 * Starts consuming the run queue (PLAN M6): a BullMQ worker whose jobs run `processRun`, with the engine in a
 * piscina thread pool.
 *
 * - **Retries:** 3 attempts with exponential backoff (set when the job is queued). A PermanentFailure is not
 *   retried.
 * - **Crash recovery:** a job holds a lock that this process renews. If the process dies, the lock runs out, and
 *   another worker (or this one, restarted) picks the job up again.
 * - **Dead-letter queue:** a job that failed for good is copied to `drift-runs-dead`, with why, for inspection.
 * - **Timeout:** the engine's thread is ended when a run exceeds `runTimeoutMs`.
 */
export function createRunWorker(options: RunWorkerOptions): RunWorker {
  const { log } = options;
  const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
  let engine: RunEngine;
  let pool: Piscina<EngineTask, EngineResult> | undefined;
  if (options.engine) {
    engine = options.engine;
  } else {
    const threads = new Piscina<EngineTask, EngineResult>({
      filename: fileURLToPath(new URL(`./engine-task${extension}`, import.meta.url)),
      maxThreads: options.concurrency,
      idleTimeout: 30_000,
    });
    pool = threads;
    engine = (task, signal) => threads.run(task, { signal, transferList: [task.port] });
  }
  const semaphore = createSemaphore(options.redis, { limit: options.orgConcurrency, leaseMs: LEASE_MS });
  const dead = new Queue(DEAD_QUEUE, { connection: options.redis });

  const worker = new Worker(
    RUN_QUEUE,
    async (job: Job, token?: string) => {
      try {
        await processRun(
          {
            id: job.id ?? "",
            data: job.data,
            attemptsMade: job.attemptsMade,
            attempts: job.opts.attempts ?? 1,
            delay: async (ms) => {
              await job.moveToDelayed(Date.now() + ms, token);
              throw new DelayedError();
            },
          },
          { ...options, semaphore, engine }
        );
      } catch (error) {
        if (error instanceof PermanentFailure) throw new UnrecoverableError(`${error.category}: ${error.message}`);
        throw error;
      }
    },
    {
      // BullMQ needs its own blocking connection.
      connection: options.redis.duplicate(),
      concurrency: options.concurrency,
      lockDuration: options.lockDurationMs ?? 30_000,
      stalledInterval: options.lockDurationMs ?? 30_000,
      maxStalledCount: 2,
    }
  );

  // Dead-letter handling runs outside the job; `close` waits for whatever is still in progress.
  const pending = new Set<Promise<void>>();
  worker.on("failed", (job, error) => {
    if (!job) return;
    const handling = deadLetter({ db: options.db, redis: options.redis, dead, log }, job, error)
      .catch((failure: unknown) => {
        log.error({ err: describeError(failure) }, "dead-letter handling failed");
      })
      .finally(() => pending.delete(handling));
    pending.add(handling);
  });
  worker.on("error", (error) => {
    log.warn({ err: describeError(error) }, "queue worker error");
  });

  return {
    async close() {
      await worker.close();
      await Promise.all(pending);
      await dead.close();
      await pool?.destroy();
    },
  };
}

/**
 * After a job's last failed attempt: copies it, with the reason, to the dead-letter queue, and settles its run if
 * nothing else did. A job the queue itself gave up on (it stalled too often: the workers that took it kept dying)
 * never reached the processor's own failure handling, so its run would otherwise stay `running` for ever.
 */
export async function deadLetter(
  deps: { db: Db; redis: Redis; dead: Pick<Queue, "add">; log: Logger },
  job: { data: unknown; attemptsMade: number; opts: { attempts?: number | undefined } },
  error: Error
): Promise<void> {
  const final = error instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
  if (!final) return;
  const data = RunJob.safeParse(job.data);
  const reason = error.message.slice(0, 500);
  await deps.dead.add("dead", {
    ...(data.success ? { runId: data.data.runId, orgId: data.data.orgId } : {}),
    reason,
    failedAt: new Date().toISOString(),
  });
  if (!data.success) {
    deps.log.error({ reason }, "job without a valid run moved to the dead-letter queue");
    return;
  }
  const run = await deps.db.run.findFirst({ where: { id: data.data.runId, orgId: data.data.orgId } });
  if (run && run.status !== "FAILED" && run.status !== "COMPLETE") {
    const message = "The run could not be completed after several attempts.";
    await deps.db.run.update({
      where: { id: run.id },
      data: { status: "FAILED", errorCategory: "internal", errorMessage: message, completedAt: new Date() },
    });
    await publishRunEvent(deps.redis, run.id, {
      type: "run.failed",
      at: new Date().toISOString(),
      category: "internal",
      message,
      willRetry: false,
    });
  }
  deps.log.error({ runId: data.data.runId, reason }, "run moved to the dead-letter queue");
}
