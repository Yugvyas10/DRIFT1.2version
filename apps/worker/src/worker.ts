import type { Db } from "@drift/db";
import {
  describeError,
  redisTarget,
  type Logger,
  type ObjectStore,
  type Redis,
  type S3Settings,
} from "@drift/platform";
import { EnvValidationError, parseWorkerEnv, type WorkerEnv } from "./env.ts";
import type { RunWorker, RunWorkerOptions } from "./queue-worker.ts";

/** The connections a worker process holds. */
export interface Services {
  db: Db;
  redis: Redis;
  store: ObjectStore;
}

/** How the process is put together; `main.ts` passes the real ones, tests pass fakes. */
export interface WorkerDeps {
  createLogger: (level: WorkerEnv["LOG_LEVEL"]) => Logger;
  connect: (env: WorkerEnv, s3: S3Settings) => Services;
  startTracing: (endpoint: string | undefined) => { shutdown(): Promise<void> };
  startRunWorker: (options: RunWorkerOptions) => RunWorker;
  /** Resolves when the process is asked to stop (SIGTERM or SIGINT). */
  stopSignal: () => Promise<string>;
  writeStderr: (text: string) => void;
}

/** How long each dependency may take to answer a startup or `--check` probe. */
const PROBE_TIMEOUT_MS = 5000;

export function s3Settings(env: WorkerEnv): S3Settings {
  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  };
}

/** Probes the database, Redis and object storage; returns the ones that did not answer, with a safe reason. */
export async function checkServices(
  services: Services,
  timeoutMs = PROBE_TIMEOUT_MS
): Promise<{ service: string; reason: string }[]> {
  const probes: [string, () => Promise<unknown>][] = [
    ["database", () => services.db.$queryRaw`SELECT 1`],
    ["redis", () => services.redis.ping()],
    ["storage", () => services.store.ping()],
  ];
  const results = await Promise.all(
    probes.map(async ([service, probe]) => {
      try {
        await within(probe(), timeoutMs);
        return undefined;
      } catch (error) {
        return { service, reason: describeError(error).message || describeError(error).name };
      }
    })
  );
  return results.filter((result) => result !== undefined);
}

/**
 * The worker process (PLAN M6). Validates the environment, connects to the database, Redis and object storage,
 * and checks that each answers. Then:
 *
 * - with `--check`, exits 0 (all reachable) or 1 — a smoke test for deployments and CI;
 * - otherwise consumes the run queue until SIGTERM or SIGINT, then stops taking jobs, lets the ones in progress
 *   finish, closes its connections and exits 0. A job still running when the process is killed outright is
 *   retried by another worker once its lock expires.
 *
 * Returns the exit code.
 */
export async function runWorker(
  argv: readonly string[],
  source: Readonly<Record<string, string | undefined>>,
  deps: WorkerDeps
): Promise<number> {
  let env: WorkerEnv;
  try {
    env = parseWorkerEnv(source);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      deps.writeStderr(`${error.message}\n`);
      return 1;
    }
    throw error;
  }

  const log = deps.createLogger(env.LOG_LEVEL);
  const s3 = s3Settings(env);
  const services = deps.connect(env, s3);
  const disconnect = async () => {
    await services.db.$disconnect().catch(() => undefined);
    // Not QUIT: a client still trying to reach a Redis that is down would wait for it.
    services.redis.disconnect();
  };

  const down = await checkServices(services);
  if (down.length > 0) {
    // Only the Redis host is logged, never a URL: those can carry passwords.
    log.error({ down, redis: redisTarget(env.REDIS_URL) }, "dependencies unreachable");
    await disconnect();
    return 1;
  }
  if (argv.includes("--check")) {
    log.info({ redis: redisTarget(env.REDIS_URL) }, "database, redis and storage reachable");
    await disconnect();
    return 0;
  }

  const tracing = deps.startTracing(env.OTEL_EXPORTER_OTLP_ENDPOINT);
  const worker = deps.startRunWorker({
    ...services,
    s3,
    log,
    concurrency: env.WORKER_CONCURRENCY,
    orgConcurrency: env.ORG_CONCURRENCY,
    runTimeoutMs: env.RUN_TIMEOUT_MS,
  });
  log.info(
    {
      concurrency: env.WORKER_CONCURRENCY,
      orgConcurrency: env.ORG_CONCURRENCY,
      tracing: env.OTEL_EXPORTER_OTLP_ENDPOINT !== undefined,
    },
    "worker started"
  );

  const signal = await deps.stopSignal();
  log.info({ signal }, "stopping: finishing the runs in progress");
  await worker.close();
  await tracing.shutdown();
  await disconnect();
  log.info({}, "worker stopped");
  return 0;
}

/** A promise that rejects after `ms` if it has not settled: a client that keeps reconnecting would otherwise hang. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`no answer within ${String(ms)} ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
