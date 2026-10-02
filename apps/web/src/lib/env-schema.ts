import { z } from "zod";

/**
 * Environment the web app needs. Validated when Next.js loads `next.config.ts`, so `next dev`,
 * `next build` and `next start` all refuse to run with an invalid environment (docs/SECURITY.md).
 * Variables are added here in the milestone that first uses them.
 */
const WebEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url({
      protocol: /^https?$/,
      error: "APP_URL must be an http(s) URL, for example http://localhost:3000",
    }),
    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      error: "DATABASE_URL must be a postgresql:// URL",
    }),
    /** Signs session tokens. Generate with `openssl rand -base64 32`. */
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters (openssl rand -base64 32)"),
    /** GitHub OAuth: both or neither. Without them only email and password sign-in is offered. */
    GITHUB_ID: z.string().min(1).optional(),
    GITHUB_SECRET: z.string().min(1).optional(),
    S3_ENDPOINT: z.url({ protocol: /^https?$/, error: "S3_ENDPOINT must be an http(s) URL" }),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
  })
  .refine((env) => (env.GITHUB_ID === undefined) === (env.GITHUB_SECRET === undefined), {
    message: "GITHUB_ID and GITHUB_SECRET must be set together",
    path: ["GITHUB_ID"],
  });

export type WebEnv = z.infer<typeof WebEnvSchema>;

/** Raised when the environment is invalid. The message lists every problem, one per line, and no values. */
export class EnvValidationError extends Error {
  constructor(details: string) {
    super(`Invalid web environment:\n${details}`);
    this.name = "EnvValidationError";
  }
}

export function parseWebEnv(source: Readonly<Record<string, string | undefined>>): WebEnv {
  // An empty value in a .env file means "not set".
  const present = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  const result = WebEnvSchema.safeParse(present);
  if (!result.success) {
    throw new EnvValidationError(z.prettifyError(result.error));
  }
  return result.data;
}
