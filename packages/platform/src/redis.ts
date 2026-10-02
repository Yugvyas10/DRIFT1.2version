import { Redis } from "ioredis";

export type { Redis } from "ioredis";

/**
 * A Redis connection for the queue, events, the semaphore and rate limits. `maxRetriesPerRequest: null` is what
 * BullMQ requires of its connections: commands wait for a reconnect instead of failing after a few tries.
 */
export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: true });
}

/** `host:port` of a Redis URL, safe to log: never the username or password. */
export function redisTarget(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port || "6379"}`;
}
