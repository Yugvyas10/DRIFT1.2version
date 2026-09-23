"use client";

import React, { useState, useEffect } from "react";
import { ArrowRight, FileCode, GitCompare, Play, ShieldAlert, CheckCircle2 } from "lucide-react";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionTitle } from "@/components/ui/section-title";
import { FadeIn } from "@/components/animations/fade-in";
import { cn } from "@/lib/utils";

const workflowSteps = [
  {
    step: "01",
    title: "OpenAPI Spec Ingestion",
    icon: <FileCode className="h-5 w-5" />,
    description: "Parses baseline vs target OpenAPI 3.x contracts into dereferenced AST schemas.",
  },
  {
    step: "02",
    title: "AST Structural Diff",
    icon: <GitCompare className="h-5 w-5" />,
    description: "Calculates schema, parameter, type, and constraint delta matrices.",
  },
  {
    step: "03",
    title: "Shadow Traffic Replay",
    icon: <Play className="h-5 w-5" />,
    description: "Replays sanitized production traffic snippets against candidate endpoints.",
  },
  {
    step: "04",
    title: "Compatibility Classification",
    icon: <ShieldAlert className="h-5 w-5" />,
    description: "Classifies changes into non-breaking, warning, or critical breaking regressions.",
  },
  {
    step: "05",
    title: "PR Report Dispatch",
    icon: <CheckCircle2 className="h-5 w-5" />,
    description: "Publishes inline GitHub PR comments, Slack alerts, and CI gate triggers.",
  },
];

export function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % workflowSteps.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <SectionContainer gridBg id="how-it-works">
      <SectionTitle
        badge="Sentinel Workflow"
        title="How DRIFT Protects API Contracts in 5 Automated Steps"
        description="Continuous contract awareness integrated directly into your CI/CD deployment pipeline."
      />

      <div className="mt-8 space-y-6">
        {/* Step Buttons / Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {workflowSteps.map((s, idx) => {
            const isActive = idx === activeStep;
            return (
              <button
                key={s.step}
                onClick={() => setActiveStep(idx)}
                className={cn(
                  "flex flex-col items-start p-4 rounded-xl border transition-all text-left",
                  isActive
                    ? "border-drift-cyan bg-drift-cyan/10 shadow-[0_0_20px_rgba(0,240,255,0.2)]"
                    : "border-slate-800 bg-[#0A0E17]/60 hover:border-slate-700"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className={cn("font-mono text-xs font-bold", isActive ? "text-drift-cyan" : "text-slate-500")}>
                    STAGE {s.step}
                  </span>
                  <div className={cn("text-slate-400", isActive && "text-drift-cyan")}>{s.icon}</div>
                </div>
                <h4 className="mt-3 text-xs font-semibold text-white">{s.title}</h4>
              </button>
            );
          })}
        </div>

        {/* Active Stage Detail Panel */}
        <FadeIn key={activeStep}>
          <div className="rounded-2xl border border-slate-800 bg-[#0A0E17] p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
            <div className="space-y-3 max-w-xl">
              <div className="inline-flex items-center space-x-2 rounded-full border border-drift-cyan/30 bg-drift-cyan/10 px-3 py-1 font-mono text-xs text-drift-cyan">
                <span>Active Pipeline Stage {workflowSteps[activeStep].step} of 05</span>
              </div>
              <h3 className="text-2xl font-bold text-white">{workflowSteps[activeStep].title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{workflowSteps[activeStep].description}</p>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-[#04060A] font-mono text-xs text-drift-cyan shrink-0 min-w-[280px]">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
                <span>STAGE STATUS</span>
                <span className="text-emerald-400">EXECUTING</span>
              </div>
              <p className="mt-2 text-slate-300">Processing stage_{workflowSteps[activeStep].step} AST delta...</p>
              <div className="mt-3 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-drift-cyan animate-pulse rounded-full" style={{ width: `${(activeStep + 1) * 20}%` }} />
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </SectionContainer>
  );
}
