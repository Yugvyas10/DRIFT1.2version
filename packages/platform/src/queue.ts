import { Queue, type JobsOptions } from "bullmq";
import type { Redis } from "ioredis";
import { z } from "zod";

/** The queue of server-side runs, and where jobs go after their last failed attempt (the dead-letter queue). */
export const RUN_QUEUE = "drift-runs";
export const DEAD_QUEUE = "drift-runs-dead";

/** What a job carries: only identifiers. The worker reads everything else from the database and storage. */
export const RunJob = z.strictObject({
  runId: z.string().regex(/^run_[0-9a-z]{20,32}$/),
  orgId: z.string().regex(/^org_[0-9a-z]{20,32}$/),
  /** W3C trace context of the request that queued the run, so the worker's spans join its trace. */
  trace: z.record(z.string(), z.string()).default({}),
});
export type RunJob = z.infer<typeof RunJob>;

/** A run is tried at most three times, 2 s and then 4 s apart (exponential backoff). */
export const RUN_ATTEMPTS = 3;
export const RUN_JOB_OPTIONS: JobsOptions = {
  attempts: RUN_ATTEMPTS,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  // Failed jobs are copied to the dead-letter queue by the worker; the original is kept a week for inspection.
  removeOnFail: { age: 7 * 24 * 3600 },
};

export interface RunQueue {
  /** Queues a run. The job id is the run id, so queuing the same run twice adds one job. */
  enqueue(job: RunJob): Promise<void>;
  close(): Promise<void>;
}

export function createRunQueue(connection: Redis, options: Partial<JobsOptions> = {}): RunQueue {
  const queue = new Queue<RunJob>(RUN_QUEUE, { connection });
  return {
    async enqueue(job) {
      await queue.add("run", RunJob.parse(job), { ...RUN_JOB_OPTIONS, ...options, jobId: job.runId });
    },
    close: () => queue.close(),
  };
}
