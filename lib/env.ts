import { z } from "zod";

/**
 * Server-only environment variables schema.
 * These variables are NEVER exposed to the browser.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().optional().default("3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required for Prisma database connectivity"),
  DIRECT_URL: z.string().optional(),
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters long for cryptographic security"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL").optional().default("http://localhost:3000"),
  NEXTAUTH_SESSION_MAX_AGE: z.coerce.number().optional().default(2592000),
  DRIFT_RATE_LIMIT_MAX: z.coerce.number().optional().default(100),
  DRIFT_RATE_LIMIT_WINDOW_MS: z.coerce.number().optional().default(60000),
  DRIFT_ALERT_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal("")),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

/**
 * Client-accessible environment variables schema.
 * Must be prefixed with `NEXT_PUBLIC_` to be bundled into the frontend.
 */
const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().optional().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_ENV: z.string().optional().default("Development"),
  NEXT_PUBLIC_ENABLE_3D_GLOBE: z
    .string()
    .optional()
    .transform((val) => val !== "false"),
  NEXT_PUBLIC_ENABLE_DEMO_MODE: z
    .string()
    .optional()
    .transform((val) => val !== "false"),
  NEXT_PUBLIC_ENABLE_TRAFFIC_REPLAY: z
    .string()
    .optional()
    .transform((val) => val !== "false"),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;
export type Env = ServerEnv & ClientEnv;

const isServer = typeof window === "undefined";

const parseEnv = (): Env => {
  if (isServer) {
    const merged = serverSchema.merge(clientSchema);
    const parsed = merged.safeParse(process.env);

    if (!parsed.success) {
      console.error(
        "❌ Invalid environment variables detected:",
        JSON.stringify(parsed.error.format(), null, 2)
      );
      // In development, throw to alert engineer immediately; in production, warn
      if (process.env.NODE_ENV === "development") {
        throw new Error("Invalid environment configuration. Check your .env file.");
      }
    }
    return (parsed.success ? parsed.data : process.env) as unknown as Env;
  }

  // Client runtime — only validate NEXT_PUBLIC_ variables
  const parsedClient = clientSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_ENABLE_3D_GLOBE: process.env.NEXT_PUBLIC_ENABLE_3D_GLOBE,
    NEXT_PUBLIC_ENABLE_DEMO_MODE: process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE,
    NEXT_PUBLIC_ENABLE_TRAFFIC_REPLAY: process.env.NEXT_PUBLIC_ENABLE_TRAFFIC_REPLAY,
  });

  if (!parsedClient.success) {
    console.error("❌ Invalid client environment variables:", parsedClient.error.format());
  }

  return (parsedClient.success ? parsedClient.data : {}) as unknown as Env;
};

export const env: Env = parseEnv();

