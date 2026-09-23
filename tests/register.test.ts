import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/security", () => ({
  rateLimit: vi.fn(() => true),
  clientIp: vi.fn(() => "127.0.0.1"),
}));

import { prisma } from "@/lib/prisma";
import { POST } from "../app/api/auth/register/route";

const { findUnique, create } = prisma.user as any;

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    findUnique.mockReset();
    create.mockReset();
  });

  it("creates a user with a hashed password", async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({
      id: "usr_test123",
      name: "Ada",
      email: "ada@drift.dev",
    });

    const res = await POST(
      jsonReq({ name: "Ada", email: "ada@drift.dev", password: "hunter42" })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.user.email).toBe("ada@drift.dev");
    expect(create).toHaveBeenCalledOnce();
    const data = create.mock.calls[0][0].data;
    expect(data.passwordHash).not.toBe("hunter42");
  });

  it("rejects a duplicate email with 409", async () => {
    findUnique.mockResolvedValue({ id: "existing", email: "ada@drift.dev" });

    const res = await POST(
      jsonReq({ name: "Ada", email: "ada@drift.dev", password: "hunter42" })
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain("already exists");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects invalid input with 400", async () => {
    const res = await POST(
      jsonReq({ name: "X", email: "not-an-email", password: "123" })
    );
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
