import { createHash } from "node:crypto";
import { env } from "@/lib/env";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Minimal in-memory fixed-window rate limiter.
 * Note: memory is per serverless instance — fine for demo purposes; use an
 * external store (Upstash/Redis) for strict global limits.
 */
export function rateLimit(
  key: string,
  limit: number = env.DRIFT_RATE_LIMIT_MAX ?? 100,
  windowMs: number = env.DRIFT_RATE_LIMIT_WINDOW_MS ?? 60000
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return false;
  }
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}
