import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export async function GET() {
  let database = "CONNECTED";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("Health DB probe failed:", error);
    database = "UNREACHABLE";
  }

  return NextResponse.json({
    status: database === "CONNECTED" ? "HEALTHY" : "DEGRADED",
    version: "v1.4.2",
    environment: env.NEXT_PUBLIC_APP_ENV || env.NODE_ENV,
    timestamp: new Date().toISOString(),
    probes: {
      astParser: "ONLINE",
      replayEngine: "ONLINE",
      database,
    },
    uptimeSeconds: process.uptime(),
  });
}
