import { createHash } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

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

export interface AuthenticatedUser {
  id: string;
  email: string;
  authMethod: "SESSION" | "API_KEY" | "DEMO_FALLBACK";
}

/**
 * Authenticates API requests via Bearer API token or NextAuth session.
 * Falls back to demo user if DEMO_MODE is active.
 */
export async function authenticateApiRequest(
  req: Request
): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.get("authorization");

  // 1. Check Bearer API Key
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const rawKey = authHeader.substring(7).trim();
    const hashedKey = hashApiKey(rawKey);

    const apiKey = await prisma.apiKey.findUnique({
      where: { key: hashedKey },
      include: { user: true },
    });

    if (apiKey && apiKey.user) {
      // Update last used timestamp
      await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsed: new Date() },
      });

      return {
        id: apiKey.user.id,
        email: apiKey.user.email,
        authMethod: "API_KEY",
      };
    }
  }

  // 2. Check NextAuth Session
  const session = await getServerSession(authOptions);
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (user) {
      return {
        id: user.id,
        email: user.email,
        authMethod: "SESSION",
      };
    }
  }

  // 3. Demo mode fallback for presentation / local playground
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE !== "false") {
    const demoUser = await prisma.user.findUnique({
      where: { email: "demo@drift.dev" },
    });
    if (demoUser) {
      return {
        id: demoUser.id,
        email: demoUser.email,
        authMethod: "DEMO_FALLBACK",
      };
    }
  }

  return null;
}
