import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest } from "@/lib/security";

const createReportSchema = z.object({
  projectId: z.string().min(1),
  prTitle: z.string().min(1),
  severity: z
    .enum(["PASSED", "WARNING", "CRITICAL_BREAKING"])
    .default("PASSED"),
  safeCount: z.number().int().min(0).default(0),
  warningCount: z.number().int().min(0).default(0),
  breakingCount: z.number().int().min(0).default(0),
  jsonPayload: z.string().optional().default("{}"),
});

export async function GET() {
  try {
    const reports = await prisma.report.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        prTitle: true,
        severity: true,
        safeCount: true,
        warningCount: true,
        breakingCount: true,
        createdAt: true,
        project: { select: { name: true, environment: true } },
      },
    });

    return NextResponse.json({
      reports: reports.map((r) => ({
        id: r.id,
        prTitle: r.prTitle,
        status: r.severity,
        breakingCount: r.breakingCount,
        warningCount: r.warningCount,
        safeCount: r.safeCount,
        projectName: r.project.name,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load reports" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateApiRequest(req);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized access: Valid API Key or Session required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validated = createReportSchema.parse(body);

    const report = await prisma.report.create({
      data: {
        projectId: validated.projectId,
        prTitle: validated.prTitle,
        severity: validated.severity,
        safeCount: validated.safeCount,
        warningCount: validated.warningCount,
        breakingCount: validated.breakingCount,
        jsonPayload: validated.jsonPayload,
      },
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2003") {
      return NextResponse.json(
        { error: "Project does not exist" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Invalid input" },
      { status: 400 }
    );
  }
}
