import { z } from "zod";

/** Environment the worker needs. Validated at startup; the process refuses to start if it is invalid. */
const WorkerEnvSchema = z.object({
  REDIS_URL: z.url({ protocol: /^rediss?$/, error: "REDIS_URL must be a redis:// or rediss:// URL" }),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

/** Raised when the environment is invalid. The message lists every problem, one per line. */
export class EnvValidationError extends Error {
  constructor(details: string) {
    super(`Invalid worker environment:\n${details}`);
    this.name = "EnvValidationError";
  }
}

export function parseWorkerEnv(source: Readonly<Record<string, string | undefined>>): WorkerEnv {
  const result = WorkerEnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(z.prettifyError(result.error));
  }
  return result.data;
}

/** `host:port` of a Redis URL, safe to log: never includes the username or password. */
export function redisTarget(redisUrl: string): string {
  const url = new URL(redisUrl);
  return `${url.hostname}:${url.port || "6379"}`;
}
