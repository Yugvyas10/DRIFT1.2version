import type { Redis } from "ioredis";

/**
 * A counting semaphore in Redis, one per name (here: per organisation), so one tenant's burst of runs cannot
 * take every worker (BullMQ's own per-group limits are a paid feature; PLAN risk R9).
 *
 * Each holder has a lease that expires. A worker that dies cannot release its slot, so the slot frees itself
 * when the lease runs out; a live worker keeps renewing. Acquire, renew and release are single Lua scripts, so
 * two workers can never both take the last slot.
 */
export interface Semaphore {
  /** Takes a slot for `holder` (or renews the one it has). False when all `limit` slots are held by others. */
  acquire(name: string, holder: string): Promise<boolean>;
  release(name: string, holder: string): Promise<void>;
  /** How many slots are held right now (expired leases not counted). */
  held(name: string): Promise<number>;
}

const ACQUIRE = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZSCORE', KEYS[1], ARGV[4]) or redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[3]) then
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
  redis.call('PEXPIRE', KEYS[1], ARGV[5])
  return 1
end
return 0`;

export function createSemaphore(
  redis: Redis,
  options: { limit: number; leaseMs: number; now?: () => number }
): Semaphore {
  const now = options.now ?? (() => Date.now());
  const key = (name: string) => `drift:semaphore:${name}`;
  return {
    async acquire(name, holder) {
      const time = now();
      const taken = await redis.eval(
        ACQUIRE,
        1,
        key(name),
        time,
        time + options.leaseMs,
        options.limit,
        holder,
        options.leaseMs * 2
      );
      return taken === 1;
    },
    async release(name, holder) {
      await redis.zrem(key(name), holder);
    },
    async held(name) {
      return redis.zcount(key(name), `(${String(now())}`, "+inf");
    },
  };
}
