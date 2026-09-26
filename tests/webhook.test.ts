import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    organization: {
      upsert: vi.fn(),
    },
    analysis: {
      upsert: vi.fn(),
    },
  },
}));

import { POST } from "../app/api/webhooks/github/route";

describe("GitHub Webhook Handler /api/webhooks/github", () => {
  const secret = "test-webhook-secret-123";

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = secret;
    vi.clearAllMocks();
  });

  it("rejects request if GITHUB_WEBHOOK_SECRET is unconfigured", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const req = new Request("http://localhost/api/webhooks/github", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("rejects request with invalid HMAC signature", async () => {
    const body = JSON.stringify({ action: "opened" });
    const req = new Request("http://localhost/api/webhooks/github", {
      method: "POST",
      headers: {
        "x-hub-signature-256": "sha256=invalid",
        "x-github-event": "pull_request",
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("accepts valid HMAC signature and processes pull_request opened event", async () => {
    const payload = {
      action: "opened",
      pull_request: {
        number: 42,
        title: "Add new endpoint",
        head: { sha: "abc1234" },
      },
      repository: {
        name: "checkout-service",
        full_name: "acme/checkout-service",
      },
    };
    const body = JSON.stringify(payload);
    const validSignature =
      "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

    const { prisma } = await import("@/lib/prisma");
    (prisma.project.findUnique as any).mockResolvedValue({
      id: "prj_123",
      name: "checkout-service",
    });
    (prisma.analysis.upsert as any).mockResolvedValue({
      id: "an_123",
      runId: "run_checkout-service_pr42_abc1234",
    });

    const req = new Request("http://localhost/api/webhooks/github", {
      method: "POST",
      headers: {
        "x-hub-signature-256": validSignature,
        "x-github-event": "pull_request",
      },
      body,
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.runId).toBe("run_checkout-service_pr42_abc1234");
  });
});
