import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { apiKeySchema } from "@/lib/validations/project";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIp, hashApiKey, rateLimit } from "@/lib/security";

async function resolveUserId() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) return session.user.id;

  const demo = await prisma.user.upsert({
    where: { email: "demo@drift.dev" },
    update: {},
    create: { email: "demo@drift.dev", name: "Demo User" },
  });
  return demo.id;
}

export async function POST(req: Request) {
  try {
    if (!rateLimit(`keys:${clientIp(req)}`, 10, 60_000)) {
      return NextResponse.json(
        { error: "Too many requests, slow down" },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validated = apiKeySchema.parse(body);
    const userId = await resolveUserId();

    const rawKey = "drift_live_" + randomBytes(24).toString("hex");

    const created = await prisma.apiKey.create({
      data: {
        userId,
        name: validated.name,
        key: hashApiKey(rawKey),
      },
    });

    return NextResponse.json(
      {
        key: {
          id: created.id,
          name: created.name,
          key: rawKey,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Invalid input" },
      { status: 400 }
    );
  }
}
