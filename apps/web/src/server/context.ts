import { createDb, type Db } from "@drift/db";
import {
  createLogger,
  createRedis,
  createRunQueue,
  createS3Store,
  describeError,
  RunEventHub,
  type Redis,
  type RunQueue,
} from "@drift/platform";
import { env } from "@/env";
import { createApi, runStarter, type Api } from "./api/handlers";
import { authOptions as buildAuthOptions } from "./auth/options";
import { sessionReader } from "./auth/session";
import { createRateLimits } from "./rate-limit";

/**
 * The live database client, Redis, object store, queue, session reader and API of this process. Everything else
 * in `src/server` takes these as arguments, so only this file reads the environment.
 */
const secure = env.APP_URL.startsWith("https://");
// next-auth builds its callback URLs and picks its cookie names from NEXTAUTH_URL; it is the same as APP_URL.
process.env.NEXTAUTH_URL ??= env.APP_URL;

export const log = createLogger({ service: "drift-web", level: env.LOG_LEVEL });

// One of each per process; in development, module reloads would otherwise open new connections each time.
// Nothing here connects until it is first used, so `next build` never touches the database or Redis.
const globals = globalThis as {
  __driftDb?: Db;
  __driftRedis?: Redis;
  __driftQueue?: RunQueue;
  __driftHub?: RunEventHub;
};
export const db: Db = (globals.__driftDb ??= createDb(env.DATABASE_URL));

export const redis: Redis = (globals.__driftRedis ??= (() => {
  const client = createRedis(env.REDIS_URL, { failFast: true });
  // Without a listener, ioredis prints connection errors itself, with the URL. /readyz reports the outage.
  client.on("error", (error: unknown) => {
    log.warn({ err: describeError(error) }, "redis error");
  });
  return client;
})());

const queue = (): RunQueue => (globals.__driftQueue ??= createRunQueue(redis));
const hub = (): RunEventHub => (globals.__driftHub ??= new RunEventHub(redis));

export const store = createS3Store({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});

export const session = sessionReader(env.AUTH_SECRET, secure);

export const limits = createRateLimits(redis, {}, (error) => {
  log.warn({ err: describeError(error) }, "rate limit not applied: redis unreachable");
});

export const authOptions = buildAuthOptions(db, {
  secret: env.AUTH_SECRET,
  github: env.GITHUB_ID && env.GITHUB_SECRET ? { clientId: env.GITHUB_ID, clientSecret: env.GITHUB_SECRET } : undefined,
  limitLogin: (email) => limits.consume("login", email),
});

export const githubEnabled = env.GITHUB_ID !== undefined;

const runQueue: RunQueue = { enqueue: (job) => queue().enqueue(job), close: () => queue().close() };

/** Queues a server-side run (for server actions; the API has its own, the same). */
export const startRun = runStarter({ queue: runQueue, redis });

export const api: Api = createApi({
  db,
  store,
  session,
  redis,
  queue: runQueue,
  hub: { subscribe: (runId, listener) => hub().subscribe(runId, listener) },
  limits,
});
