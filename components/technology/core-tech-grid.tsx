"use client";

import React, { useState } from "react";
import { FileCode, GitCompare, Play, ShieldAlert, FileText, GitBranch, Check, ChevronRight } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/lib/utils";

const stagesData = [
  {
    title: "1. OpenAPI Validation",
    icon: <FileCode className="h-5 w-5 text-drift-cyan" />,
    summary: "Dereferences $ref objects and validates OpenAPI 3.0 & 3.1 specifications into AST trees.",
    highlights: ["Schema dereferencing", "Swagger 2.0 & OpenAPI 3.1 support", "AST tree normalization"],
    demoCode: `// AST Validation Output
{
  "valid": true,
  "specification": "3.1.0",
  "total_endpoints": 48,
  "dereferenced_schemas": 142
}`,
  },
  {
    title: "2. Structural Diff Engine",
    icon: <GitCompare className="h-5 w-5 text-drift-purple" />,
    summary: "Calculates microsecond deltas across endpoints, parameters, request bodies, and response schemas.",
    highlights: ["Parameter type mutation matrix", "Enum constraint verification", "Response status delta"],
    demoCode: `// Structural AST Delta
"mutation": {
  "endpoint": "/v2/orders",
  "field": "billing_zip",
  "type": "STRING",
  "constraint": "REQUIRED"
}`,
  },
  {
    title: "3. Traffic Replay Engine",
    icon: <Play className="h-5 w-5 text-drift-cyan" />,
    summary: "Replays sanitized shadow production traffic payloads against candidate endpoints without user latency.",
    highlights: ["eBPF kernel probe capture", "In-memory PII scrubbing", "Zero production impact"],
    demoCode: `// Traffic Replay Evaluation
"replayed_payloads": 50000,
"failed_validations": 14,
"failure_rate": "0.028%"`,
  },
  {
    title: "4. Classification Engine",
    icon: <ShieldAlert className="h-5 w-5 text-rose-400" />,
    summary: "Classifies changes into Non-Breaking (Safe), Deprecation (Risky), or Critical Breaking Regressions.",
    highlights: ["ML severity classification", "Downstream consumer mapping", "Zero false positive guarantee"],
    demoCode: `// Compatibility Classification
"severity": "CRITICAL_BREAKING",
"affected_sdks": ["iOS-v3.2", "Android-v2.1"],
"action": "BLOCK_DEPLOYMENT"`,
  },
  {
    title: "5. Report Generator",
    icon: <FileText className="h-5 w-5 text-amber-400" />,
    summary: "Generates high-precision engineering reports in Console text, structured JSON, or rich HTML formats.",
    highlights: ["GitHub PR inline comments", "Structured JSON export", "Interactive HTML summaries"],
    demoCode: `// Multi-Format Report
"report_format": "GITHUB_CHECKS_API",
"status": "COMPLETED",
"summary": "1 Breaking Change Blocked"`,
  },
  {
    title: "6. CI/CD Integration",
    icon: <GitBranch className="h-5 w-5 text-emerald-400" />,
    summary: "Integrates directly into GitHub Actions, GitLab CI, and CircleCI to block breaking deployment merges.",
    highlights: ["GitHub Checks API", "GitLab CI runner step", "Automated Slack dispatch"],
    demoCode: `// GitHub Actions Step
- name: DRIFT Sentinel Check
  uses: drift-platform/action@v1
  with:
    fail-on: CRITICAL_BREAKING`,
  },
];

export function CoreTechGrid() {
  const [selectedStageIndex, setSelectedStageIndex] = useState(0);

  return (
    <div className="space-y-8">
      {/* Grid of 6 Interactive Stage Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stagesData.map((stage, idx) => {
          const isSelected = idx === selectedStageIndex;
          return (
            <SpotlightCard
              key={stage.title}
              onClick={() => setSelectedStageIndex(idx)}
              className={cn(
                "cursor-pointer transition-all space-y-4",
                isSelected && "border-drift-cyan bg-drift-cyan/10 shadow-[0_0_25px_rgba(0,240,255,0.15)]"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-[#06080D]">
                  {stage.icon}
                </div>
                {isSelected && <Badge variant="default" className="text-[10px]">SELECTED STAGE</Badge>}
              </div>

              <div>
                <h4 className="text-base font-bold text-white">{stage.title}</h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{stage.summary}</p>
              </div>

              <ul className="space-y-1.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-300">
                {stage.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-drift-cyan shrink-0" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </SpotlightCard>
          );
        })}
      </div>

      {/* Selected Stage Live Code Inspection */}
      <div className="rounded-2xl border border-slate-800 bg-[#06080D] p-6 md:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-bold text-drift-cyan uppercase">
            Live Stage Inspector: {stagesData[selectedStageIndex].title}
          </span>
          <span className="text-xs text-slate-500 font-mono">Stage Output Schema</span>
        </div>
        <CodeBlock code={stagesData[selectedStageIndex].demoCode} language="json" />
      </div>
    </div>
  );
}
