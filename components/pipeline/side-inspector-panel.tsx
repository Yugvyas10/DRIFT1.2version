"use client";

import React from "react";
import { PIPELINE_STAGES } from "@/constants/pipeline";
import { CodeBlock } from "@/components/ui/code-block";
import { Badge } from "@/components/ui/badge";
import { Layers, FileCode, CheckCircle2 } from "lucide-react";

interface SideInspectorPanelProps {
  activeStageIndex: number;
}

const stageInspectorDetails = [
  {
    purpose: "Parses, dereferences, and validates baseline vs candidate OpenAPI 3.x specifications into an immutable AST tree.",
    inputs: "baseline.openapi.json, candidate.openapi.json",
    outputs: "Normalized AST Object Tree, Component References Registry",
    specimenCode: `// Stage 1 AST Dereference
const baselineAst = await swaggerParser.dereference('./specs/v1.2.0.json');
const candidateAst = await swaggerParser.dereference('./specs/v1.3.0.json');`,
  },
  {
    purpose: "Calculates structural, type, parameter, and constraint deltas across endpoints and schemas.",
    inputs: "baselineAst, candidateAst",
    outputs: "StructuralDeltaMatrix, MutationList",
    specimenCode: `// Stage 2 Delta Calculation
const delta = diffAstTrees(baselineAst, candidateAst);
// 1 field type mutation detected in /v2/orders`,
  },
  {
    purpose: "Replays sanitized production traffic snippets against candidate environments in real time without impacting live users.",
    inputs: "eBPF Traffic Mirror Stream, Candidate URL",
    outputs: "ReplayResponseMatrix, ValidationResults",
    specimenCode: `// Stage 3 Shadow Traffic Replay
const replayResults = await shadowReplay.execute({
  stream: 'ebpf-prod-mirror',
  target: 'http://localhost:8080'
});`,
  },
  {
    purpose: "Classifies changes into non-breaking additions, safe deprecations, potential breaking schema tweaks, and critical breaking regressions.",
    inputs: "StructuralDeltaMatrix, ReplayResponseMatrix",
    outputs: "ClassificationReport, SeverityBucket",
    specimenCode: `// Stage 4 Compatibility Classifier
const classification = classifier.evaluate(delta, replayResults);
// Status: CRITICAL_BREAKING`,
  },
  {
    purpose: "Generates high-precision engineering reports, PR inline annotations, Slack alerts, and automated rollback triggers.",
    inputs: "ClassificationReport",
    outputs: "GitHub Checks API payload, HTML Report, CLI stdout",
    specimenCode: `// Stage 5 Multi-Format Report
await reportEngine.dispatch({
  format: 'GITHUB_PR_CHECKS',
  severity: classification.severity
});`,
  },
  {
    purpose: "Integrates directly into GitHub Actions or GitLab CI runners to enforce merge gates.",
    inputs: "GitHub PR Webhook Event",
    outputs: "CI Gate Pass / Fail Signal",
    specimenCode: `// Stage 6 CI Gate Trigger
if (classification.severity === 'CRITICAL_BREAKING') {
  process.exit(1); // Block PR Merge
}`,
  },
];

export function SideInspectorPanel({ activeStageIndex }: SideInspectorPanelProps) {
  const currentStage = PIPELINE_STAGES[activeStageIndex] || PIPELINE_STAGES[0];
  const inspector = stageInspectorDetails[activeStageIndex] || stageInspectorDetails[0];

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0A0E17] p-6 space-y-6 shadow-2xl h-full flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Layers className="h-4 w-4 text-drift-cyan" />
            <h4 className="text-sm font-bold text-white">Stage Inspector</h4>
          </div>
          <Badge variant="default" className="font-mono text-[10px]">
            STAGE 0{currentStage.stageNumber}
          </Badge>
        </div>

        <div>
          <h3 className="text-base font-bold text-drift-cyan">{currentStage.title}</h3>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">{inspector.purpose}</p>
        </div>

        <div className="space-y-2 text-xs">
          <div className="p-2.5 rounded-lg border border-slate-800 bg-[#06080D]">
            <span className="text-[10px] font-mono uppercase text-slate-500 block">Inputs</span>
            <span className="font-mono text-slate-300">{inspector.inputs}</span>
          </div>
          <div className="p-2.5 rounded-lg border border-slate-800 bg-[#06080D]">
            <span className="text-[10px] font-mono uppercase text-slate-500 block">Outputs</span>
            <span className="font-mono text-drift-cyan">{inspector.outputs}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] font-mono uppercase text-slate-400 block">Specimen Implementation</span>
          <CodeBlock code={inspector.specimenCode} language="typescript" />
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <span>STATUS: ACTIVE</span>
        <span className="text-emerald-400 font-bold">READY</span>
      </div>
    </div>
  );
}
