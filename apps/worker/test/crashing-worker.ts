import { createDb } from "@drift/db";
import { createLogger, createRedis, createS3Store, type S3Settings } from "@drift/platform";
import { createRunWorker } from "../src/queue-worker.ts";

/**
 * A worker process for crash.int.test.ts: it takes a run, starts its first stage, and never finishes, so the test
 * can kill it (SIGKILL) in the middle of the run. Its job lock is short, so the job is recovered quickly.
 */
const env = (name: string) => {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name} is not set`);
  return value;
};
const s3 = JSON.parse(env("TEST_S3")) as S3Settings;
createRunWorker({
  db: createDb(env("DATABASE_URL")),
  redis: createRedis(env("REDIS_URL")),
  store: createS3Store(s3),
  s3,
  log: createLogger({ service: "crashing-worker", level: "silent" }),
  concurrency: 1,
  orgConcurrency: 2,
  runTimeoutMs: 60_000,
  lockDurationMs: 1000,
  engine: (task) => {
    task.port.postMessage({ stage: "ingest.base", status: "started" });
    return new Promise(() => undefined);
  },
});
