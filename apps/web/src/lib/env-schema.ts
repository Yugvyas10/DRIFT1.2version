import { z } from "zod";

/**
 * Environment the web app needs. Validated when Next.js loads `next.config.ts`, so `next dev`,
 * `next build` and `next start` all refuse to run with an invalid environment (docs/SECURITY.md).
 * Variables are added here in the milestone that first uses them.
 */
const WebEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url({
    protocol: /^https?$/,
    error: "APP_URL must be an http(s) URL, for example http://localhost:3000",
  }),
});

export type WebEnv = z.infer<typeof WebEnvSchema>;

/** Raised when the environment is invalid. The message lists every problem, one per line. */
export class EnvValidationError extends Error {
  constructor(details: string) {
    super(`Invalid web environment:\n${details}`);
    this.name = "EnvValidationError";
  }
}

export function parseWebEnv(source: Readonly<Record<string, string | undefined>>): WebEnv {
  const result = WebEnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(z.prettifyError(result.error));
  }
  return result.data;
}
