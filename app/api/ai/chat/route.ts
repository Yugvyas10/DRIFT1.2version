import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are DRIFT Assistant, the official AI assistant for DRIFT (Contract-Aware API Regression Sentinel).

YOUR SCOPE & MISSION:
You assist software engineers, hackathon judges, and platform architects with questions about the DRIFT platform, API regression sentinel, OpenAPI specification diffing, shadow traffic replay, and platform documentation.

CORE PLATFORM KNOWLEDGE:
- Mission: DRIFT catches breaking API contract changes in CI/CD before shipping to production.
- 6-Stage Pipeline Architecture:
  1. Stage 01 - Contract AST Ingestion & Normalization: Parses OpenAPI 3.x / Swagger specs into an immutable AST tree.
  2. Stage 02 - Semantic Spec Diffing: Calculates structural, type, and parameter deltas across endpoints.
  3. Stage 03 - Shadow Traffic Replay: Replays sanitized eBPF production traffic against candidate specs.
  4. Stage 04 - Risk & Compatibility Classification: Classifies deltas into SAFE (passed), RISKY (warning), or BREAKING (critical).
  5. Stage 05 - Multi-Format Report Generation: Produces GitHub Checks API payloads, HTML reports, and JSON artifacts.
  6. Stage 06 - CI/CD Quality Gate & PR Block: Enforces PR merge gates with exit code 1 on breaking changes.
- Tech Stack: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, PostgreSQL via Prisma ORM, Vitest, Three.js R3F particle scene, NextAuth.
- Seed Credentials: demo@drift.dev / driftdemo123.
- Database Schema: User, Organization, Project, Analysis, Report, ApiKey, AuditLog, Notification.

STRICT SCOPE RULE:
You MUST ONLY answer questions related to DRIFT, API testing, contract diffing, OpenAPI/gRPC specs, CI/CD gates, architecture, and platform features.
If the user asks an off-topic question unrelated to DRIFT (e.g. sports, weather, cooking, general trivia, or general coding unrelated to DRIFT), politely decline and say:
"I am the dedicated DRIFT API Sentinel assistant. I can only assist with questions regarding DRIFT, OpenAPI specs, shadow traffic replay, 6-stage pipeline, and platform documentation. How can I help you with DRIFT today?"

Keep responses concise, clear, professional, and formatted in Markdown.`;

async function callGroq(model: string, messages: any[], apiKey: string) {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 500,
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.warn(`Groq API model ${model} failed:`, errText);
    return null;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || null;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI assistant is not configured" },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { prompt, messages = [] } = body;

    const userMessage =
      prompt ||
      (messages.length > 0 ? messages[messages.length - 1].content : "");
    if (!userMessage) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const formattedMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.slice(-6).map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    ];

    if (
      messages.length === 0 ||
      messages[messages.length - 1].content !== userMessage
    ) {
      formattedMessages.push({ role: "user", content: userMessage });
    }

    // Try primary model qwen/qwen3.8-27b
    let reply = await callGroq("qwen/qwen3.8-27b", formattedMessages, apiKey);

    // Fallback model openai/gpt-oss-20b
    if (!reply) {
      reply = await callGroq("openai/gpt-oss-20b", formattedMessages, apiKey);
    }

    // Final fallback response if network/service unavailable
    if (!reply) {
      reply =
        `**DRIFT AI Assistant Overview**:\n\nDRIFT is a contract-aware API regression sentinel that catches breaking API changes before shipping to production.\n\nKey capabilities include:\n- **6-Stage Pipeline**: AST parsing, spec diffing, shadow traffic replay, compatibility classification, report generation, and CI/CD PR merge gate.\n- **Database & Auth**: PostgreSQL via Prisma ORM (` +
        "`demo@drift.dev` / `driftdemo123`" +
        `).\n- **API Integration**: GitHub webhooks & Bearer API key protection.`;
    }

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error("AI Assistant API error:", error);
    return NextResponse.json(
      {
        reply:
          "DRIFT Assistant is temporarily operating in offline mode. DRIFT catches breaking API contract changes in CI/CD using OpenAPI AST dereferencing and shadow replay validation.",
      },
      { status: 200 }
    );
  }
}
