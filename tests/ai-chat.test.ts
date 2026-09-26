import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../app/api/ai/chat/route";

describe("Groq AI Assistant API /api/ai/chat", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "gsk_test_mock_key";
    vi.restoreAllMocks();
  });

  it("returns 400 if prompt is missing", async () => {
    const req = new Request("http://localhost/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("calls Groq API and returns AI response", async () => {
    const mockReply =
      "DRIFT uses a 6-stage pipeline to catch breaking API changes in CI/CD.";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: mockReply } }],
      }),
    } as any);

    const req = new Request("http://localhost/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ prompt: "What does DRIFT do?" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.reply).toBe(mockReply);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer gsk_test_mock_key",
        }),
      })
    );
  });
});
