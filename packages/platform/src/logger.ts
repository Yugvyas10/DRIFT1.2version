import { pino, type DestinationStream, type Logger } from "pino";

export type { Logger } from "pino";

/** Field names whose values never reach a log, wherever they are nested one level down. */
const SECRET_FIELDS = [
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "passwordHash",
  "token",
  "apiKey",
  "key",
  "secret",
  "accessKeyId",
  "secretAccessKey",
];

/**
 * A JSON logger (pino) for a service. Every line has `service`; callers add `requestId` and `runId` with
 * `logger.child(...)`.
 *
 * Secrets and personal data stay out of logs in two ways: the code only logs identifiers, counts and timings
 * (never request bodies, payloads or contract content), and, as a second line of defence, any field with a
 * secret-looking name is replaced before the line is written, at the top level or one level down. Errors are
 * logged as their name and message only.
 */
export function createLogger(options: { service: string; level?: string; destination?: DestinationStream }): Logger {
  return pino(
    {
      level: options.level ?? "info",
      base: { service: options.service },
      redact: {
        paths: SECRET_FIELDS.flatMap((field) => [quote(field), `*.${quote(field)}`]),
        censor: "[REDACTED]",
      },
      formatters: { level: (label) => ({ level: label }) },
      serializers: { err: describeError, error: describeError },
    },
    options.destination
  );
}

const quote = (field: string) => (/^[A-Za-z_$][\w$]*$/.test(field) ? field : `["${field}"]`);

/** An error as it may be logged: its name, message and code. No stack (paths) and nothing attached to it. */
export function describeError(error: unknown): { name: string; message: string; code?: string } {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { name: error.name, message: error.message, ...(typeof code === "string" ? { code } : {}) };
  }
  // Some libraries reject or emit plain objects (an ioredis or BullMQ error during an outage). Only their
  // `name`, `message` and `code` are kept, never the rest: it could hold a command and its arguments.
  if (typeof error === "object" && error !== null) {
    const fields = error as { name?: unknown; message?: unknown; code?: unknown };
    const code = typeof fields.code === "string" ? fields.code : undefined;
    return {
      name: typeof fields.name === "string" ? fields.name : "NonError",
      message: typeof fields.message === "string" ? fields.message : (code ?? "an object that is not an Error"),
      ...(code === undefined ? {} : { code }),
    };
  }
  return { name: "NonError", message: String(error) };
}
