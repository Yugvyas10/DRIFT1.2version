import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured on server" },
      { status: 500 }
    );
  }

  const rawPayload = await req.text(); // raw body text required for HMAC verification
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawPayload).digest("hex");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json(
      { error: "Invalid HMAC signature" },
      { status: 401 }
    );
  }

  const event = req.headers.get("x-github-event");
  if (event !== "pull_request") {
    return NextResponse.json({ ok: true, message: "Ignored non-PR event" });
  }

  try {
    const payload = JSON.parse(rawPayload);
    const { action, pull_request, repository } = payload;

    if (["opened", "synchronize", "reopened"].includes(action)) {
      const repoFullName = repository?.full_name || "drift-org/default-repo";
      const prNumber = pull_request?.number || 1;
      const headSha = pull_request?.head?.sha?.substring(0, 7) || "head";
      const prTitle = pull_request?.title || `PR #${prNumber}`;

      // Resolve organization & project
      let project = await prisma.project.findUnique({
        where: { repoFullName },
      });

      if (!project) {
        const org = await prisma.organization.upsert({
          where: { slug: "drift-demo" },
          update: {},
          create: { name: "DRIFT Demo Org", slug: "drift-demo" },
        });

        project = await prisma.project.create({
          data: {
            organizationId: org.id,
            name: repository?.name || "Ingested PR Service",
            slug: (repository?.name || "ingested-service")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-"),
            repoFullName,
            environment: "Staging CI",
          },
        });
      }

      const runId = `run_${repository?.name || "repo"}_pr${prNumber}_${headSha}`;

      // Create or update analysis record
      const analysis = await prisma.analysis.upsert({
        where: { runId },
        update: {
          status: "RUNNING",
          startedAt: new Date(),
        },
        create: {
          projectId: project.id,
          runId,
          status: "PENDING",
        },
      });

      return NextResponse.json({
        ok: true,
        action,
        runId,
        analysisId: analysis.id,
        project: project.name,
      });
    }

    return NextResponse.json({
      ok: true,
      message: `Ignored action: ${action}`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to process webhook" },
      { status: 400 }
    );
  }
}
