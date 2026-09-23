import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { registerSchema } from "@/lib/validations/auth";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/security";

export async function POST(req: Request) {
  try {
    if (!rateLimit(`register:${clientIp(req)}`, 5, 60_000)) {
      return NextResponse.json(
        { error: "Too many requests, slow down" },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validated = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(validated.password, 10);

    const user = await prisma.user.create({
      data: {
        name: validated.name,
        email: validated.email,
        passwordHash,
      },
    });

    return NextResponse.json(
      {
        message: "User registered successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message || "Invalid input" },
      { status: 400 }
    );
  }
}
