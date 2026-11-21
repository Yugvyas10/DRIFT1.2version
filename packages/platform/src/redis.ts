import { Redis } from "ioredis";

export type { Redis } from "ioredis";

/**
 * A Redis connection for the queue, events, the semaphore and rate limits.
 *
 * - Default (the worker): `maxRetriesPerRequest: null`, which BullMQ requires of a worker's connections. A command
 *   waits for Redis to come back instead of failing: a worker should pause during an outage, not fail runs.
 * - `failFast` (the web app): a command fails after one reconnection attempt, so a request during an outage gets
 *   an answer (a 503, or a rate limit that fails open) instead of hanging.
 */
export function createRedis(url: string, options: { failFast?: boolean } = {}): Redis {
  // lazyConnect: nothing connects until the first command, so importing a module that holds a client (as
  // `next build` does) opens no connection.
  return new Redis(url, {
    lazyConnect: true,
    enableReadyCheck: true,
    ...(options.failFast ? { maxRetriesPerRequest: 1, connectTimeout: 2000 } : { maxRetriesPerRequest: null }),
  });
}

/** `host:port` of a Redis URL, safe to log: never the username or password. */
export function redisTarget(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || "6379"}`;
}
