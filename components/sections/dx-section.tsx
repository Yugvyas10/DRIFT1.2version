"use client";

import React, { useState } from "react";
import { Terminal as TerminalIcon, FileCode, GitPullRequest, Activity } from "lucide-react";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionTitle } from "@/components/ui/section-title";
import { CodeBlock } from "@/components/ui/code-block";
import { Terminal } from "@/components/ui/terminal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FadeIn } from "@/components/animations/fade-in";

const cliSample = `drift diff \\
  --baseline=./specs/v1.2.0.openapi.json \\
  --candidate=./specs/v1.3.0.openapi.json \\
  --traffic-probe=ebpf-cluster-us-east \\
  --fail-on=CRITICAL_BREAKING

[1/5] Ingesting OpenAPI 3.1 contract AST... Done (12ms)
[2/5] Calculating AST delta matrix... Done (6ms)
[3/5] Replaying 50,000 shadow HTTP payloads... Done (84ms)
[4/5] Classifying runtime compatibility... Found 1 Breaking Mutation
[5/5] Dispatched GitHub PR check annotation to PR #402.`;

const specDiffSample = `{
  "delta_summary": {
    "breaking_changes": 1,
    "non_breaking_additions": 3,
    "status": "FAILED_CONTRACT_VERIFICATION"
  },
  "mutations": [
    {
      "path": "/v2/orders",
      "method": "POST",
      "change_type": "REQUIRED_FIELD_ADDED",
      "severity": "CRITICAL_BREAKING",
      "detail": "New mandatory property 'billing_zip' added without fallback default."
    }
  ]
}`;

const prCheckSample = `## 🛡️ DRIFT Sentinel Protection Report

**Result:** ❌ **BLOCKING BREAKING CHANGE DETECTED**

### Breaking Mutations (1)
- **POST /v2/orders**
  - \`CRITICAL_BREAKING\`: Field \`billing_zip\` set to \`required: true\`.
  - **Replay Result:** 14.2% of production payloads missing this field.

> *Action Required:* Provide default fallback value or maintain optional schema status.`;

export function DxSection() {
  return (
    <SectionContainer id="dx">
      <SectionTitle
        badge="Developer Experience"
        title="Designed for Engineers Who Love Clean Tools"
        description="Inspect CLI command lines, OpenAPI JSON diff outputs, and automated GitHub PR review annotations in real-time."
      />

      <FadeIn delay={0.1}>
        <Tabs defaultValue="cli" className="w-full">
          <div className="flex justify-center mb-6">
            <TabsList className="bg-[#0A0E17] border border-slate-800 p-1">
              <TabsTrigger value="cli" className="flex items-center gap-2 text-xs">
                <TerminalIcon className="h-3.5 w-3.5 text-drift-cyan" /> CLI Sentinel
              </TabsTrigger>
              <TabsTrigger value="spec" className="flex items-center gap-2 text-xs">
                <FileCode className="h-3.5 w-3.5 text-drift-purple" /> OpenAPI Spec Diff
              </TabsTrigger>
              <TabsTrigger value="pr" className="flex items-center gap-2 text-xs">
                <GitPullRequest className="h-3.5 w-3.5 text-emerald-400" /> PR Checks Report
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="cli">
            <Terminal lines={[
              { type: "input", content: "drift diff --baseline=v1.2.0.json --candidate=v1.3.0.json --traffic-probe=ebpf-cluster" },
              { type: "info", content: "[1/5] Ingesting OpenAPI 3.1 contract AST... Done (12ms)" },
              { type: "info", content: "[2/5] Calculating AST delta matrix... Done (6ms)" },
              { type: "info", content: "[3/5] Replaying 50,000 shadow HTTP payloads... Done (84ms)" },
              { type: "error", content: "CRITICAL: Added mandatory field `billing_zip` in /v2/orders payload" },
              { type: "error", content: "FAIL: 14.2% of production clients will fail request validation" },
              { type: "success", content: "Pipeline complete: GitHub PR Check updated to FAILED." },
            ]} />
          </TabsContent>

          <TabsContent value="spec">
            <CodeBlock code={specDiffSample} language="json" filename="drift-diff-summary.json" />
          </TabsContent>

          <TabsContent value="pr">
            <CodeBlock code={prCheckSample} language="markdown" filename="github-pr-annotation.md" />
          </TabsContent>
        </Tabs>
      </FadeIn>
    </SectionContainer>
  );
}
