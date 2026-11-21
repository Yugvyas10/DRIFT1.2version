import { z } from "zod";

const positive = (fallback: number) => z.coerce.number().int().min(1).default(fallback);

/** Environment the worker needs. Validated at startup; the process refuses to start if it is invalid. */
const WorkerEnvSchema = z.object({
  REDIS_URL: z.url({ protocol: /^rediss?$/, error: "REDIS_URL must be a redis:// or rediss:// URL" }),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: "DATABASE_URL must be a postgresql:// URL" }),
  S3_ENDPOINT: z.url({ protocol: /^https?$/, error: "S3_ENDPOINT must be an http(s) URL" }),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Where traces go (OTLP over HTTP, e.g. Jaeger at http://localhost:4318). Unset: tracing is off. */
  OTEL_EXPORTER_OTLP_ENDPOINT: z
    .url({ protocol: /^https?$/, error: "OTEL_EXPORTER_OTLP_ENDPOINT must be an http(s) URL" })
    .optional(),
  /** Runs this worker processes at once (each in its own thread). */
  WORKER_CONCURRENCY: positive(2),
  /** Runs one organisation may have in progress at once, across all workers. */
  ORG_CONCURRENCY: positive(2),
  /** A run that takes longer than this is stopped and failed. */
  RUN_TIMEOUT_MS: positive(10 * 60 * 1000),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

/** Raised when the environment is invalid. The message lists every problem, one per line, and no values. */
export class EnvValidationError extends Error {
  constructor(details: string) {
    super(`Invalid worker environment:\n${details}`);
    this.name = "EnvValidationError";
  }
}

export function parseWorkerEnv(source: Readonly<Record<string, string | undefined>>): WorkerEnv {
  // An empty value in a .env file means "not set".
  const present = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  const result = WorkerEnvSchema.safeParse(present);
  if (!result.success) {
    throw new EnvValidationError(z.prettifyError(result.error));
  }
  return result.data;
}
