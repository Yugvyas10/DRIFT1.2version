import { EnvValidationError, parseWorkerEnv, redisTarget, type WorkerEnv } from "./env.ts";

/** The subset of a Redis client the worker uses at startup. */
export interface RedisProbe {
  ping(): Promise<string>;
  disconnect(): void;
}

/** Structured logger (pino-compatible signature). */
export interface WorkerLogger {
  info(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export interface WorkerDeps {
  createRedis: (redisUrl: string) => RedisProbe;
  createLogger: (level: WorkerEnv["LOG_LEVEL"]) => WorkerLogger;
  writeStderr: (text: string) => void;
}

/**
 * Worker startup: validate the environment and confirm Redis is reachable.
 * Returns the process exit code. No queue processors exist yet; they arrive in M6 (docs/PLAN.md),
 * so a healthy start logs that fact and exits 0 rather than idling as if it were doing work.
 */
export async function runWorker(
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

  const logger = deps.createLogger(env.LOG_LEVEL);
  const target = redisTarget(env.REDIS_URL);
  const redis = deps.createRedis(env.REDIS_URL);
  try {
    await redis.ping();
    logger.info({ redis: target }, "redis reachable");
  } catch (error) {
    logger.error({ redis: target, reason: describeError(error) }, "redis unreachable");
    return 1;
  } finally {
    redis.disconnect();
  }

  logger.info({}, "no job processors are registered yet; queues arrive in M6 (docs/PLAN.md)");
  return 0;
}

/** A short, credential-free reason. Network errors such as AggregateError carry the cause in `code`. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return error.message || (code ?? error.name);
  }
  return String(error);
}
