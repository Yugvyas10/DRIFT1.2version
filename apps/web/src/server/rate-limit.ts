import type { Redis } from "@drift/platform";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { tooManyRequests } from "./http";

/** What is limited, how often, and by what. */
export const RATE_LIMITS = {
  /** Authenticated API calls, per API key or user. */
  api: { points: 600, duration: 60 },
  /** Sign-in attempts, per email address: slows password guessing against one account. */
  login: { points: 10, duration: 300 },
  /** Registrations, per client address. */
  register: { points: 20, duration: 3600 },
} as const;
export type RateBucket = keyof typeof RATE_LIMITS;

export interface RateLimits {
  /** Counts one use. Throws a 429 with `Retry-After` when the limit is used up. */
  consume(bucket: RateBucket, key: string): Promise<void>;
}

/**
 * Rate limits kept in Redis (SECURITY T16), so they hold across web instances and restarts, unlike the legacy
 * in-memory map. If Redis cannot be reached the request is let through: `/readyz` reports the outage, and
 * refusing every request would turn a cache problem into a full one.
 */
export function createRateLimits(
  redis: Redis,
  overrides: Partial<Record<RateBucket, { points: number; duration: number }>> = {},
  onError: (error: unknown) => void = () => undefined
): RateLimits {
  const limiters = Object.fromEntries(
    (Object.keys(RATE_LIMITS) as RateBucket[]).map((bucket) => [
      bucket,
      new RateLimiterRedis({
        storeClient: redis,
        keyPrefix: `drift:limit:${bucket}`,
        ...RATE_LIMITS[bucket],
        ...overrides[bucket],
      }),
    ])
  ) as Record<RateBucket, RateLimiterRedis>;
  return {
    async consume(bucket, key) {
      try {
        await limiters[bucket].consume(key);
      } catch (error) {
        if (error instanceof RateLimiterRes) throw tooManyRequests(Math.max(1, Math.ceil(error.msBeforeNext / 1000)));
        onError(error);
      }
    },
  };
}

/** No limits (tests that are not about them). */
export const unlimited: RateLimits = { consume: () => Promise.resolve() };

/**
 * The address a request came from, for limits on unauthenticated routes: the last `X-Forwarded-For` entry, which
 * is the one the nearest proxy (or Next.js itself) added. Earlier entries are whatever the client sent.
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded === undefined || forwarded === "" ? "unknown" : forwarded;
}
