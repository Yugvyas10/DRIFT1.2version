import { NextResponse } from "next/server";
import { createProjectSchema } from "@/lib/validations/project";
import { prisma } from "@/lib/prisma";

async function resolveOrganization() {
  return prisma.organization.upsert({
    where: { slug: "drift-demo" },
    update: {},
    create: { name: "DRIFT Demo Org", slug: "drift-demo" },
  });
}

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        environment: true,
        specVersion: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ projects });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load projects" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validated = createProjectSchema.parse(body);
    const organization = await resolveOrganization();

    const newProject = await prisma.project.create({
      data: {
        organizationId: organization.id,
        name: validated.name,
        slug: validated.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        environment: validated.environment,
        specVersion: validated.specVersion,
      },
    });

    return NextResponse.json({
      project: {
        id: newProject.id,
        name: newProject.name,
        environment: newProject.environment,
        specVersion: newProject.specVersion,
      },
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Invalid input" }, { status: 400 });
  }
}
