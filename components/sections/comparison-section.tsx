"use client";

import React, { useState } from "react";
import { Check, X, ShieldCheck, AlertOctagon, ArrowRight, Activity } from "lucide-react";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionTitle } from "@/components/ui/section-title";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/animations/fade-in";
import { cn } from "@/lib/utils";

export function ComparisonSection() {
  const [activeTab, setActiveTab] = useState<"structural" | "runtime">("runtime");

  return (
    <SectionContainer id="comparison">
      <SectionTitle
        badge="Comparison Matrix"
        title="Traditional Diffing vs. DRIFT Contract Sentinel"
        subtitle="See why static OpenAPI text comparison falls short, and how shadow traffic replay provides 100% contract confidence."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Traditional API Diff */}
        <FadeIn delay={0.1}>
          <div className="rounded-2xl border border-slate-800/80 bg-[#0A0E17]/80 p-6 md:p-8 backdrop-blur-md space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400">
                  <AlertOctagon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Traditional Spec Diff</h3>
                  <p className="text-xs text-slate-400">Static Text / JSON AST Comparison</p>
                </div>
              </div>
              <Badge variant="outline">LEGACY APPROACH</Badge>
            </div>

            <ul className="space-y-4 text-xs text-slate-300">
              <li className="flex items-start space-x-3">
                <X className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <span><strong className="text-slate-200">Only structural text matching:</strong> Flags harmless key reordering as breaking changes.</span>
              </li>
              <li className="flex items-start space-x-3">
                <X className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <span><strong className="text-slate-200">Zero traffic context:</strong> Cannot predict if deleted endpoint parameters are actively used by clients.</span>
              </li>
              <li className="flex items-start space-x-3">
                <X className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <span><strong className="text-slate-200">Noisy developer alerts:</strong> Floods PR reviews with non-actionable schema warnings.</span>
              </li>
              <li className="flex items-start space-x-3">
                <X className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <span><strong className="text-slate-200">Misses runtime crashes:</strong> Fails to detect type coercions that fail in production servers.</span>
              </li>
            </ul>

            <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-950/10 font-mono text-xs text-rose-300">
              <code>Result: 14 Warning Notifications (12 False Positives, 2 Missed Outages)</code>
            </div>
          </div>
        </FadeIn>

        {/* DRIFT Sentinel */}
        <FadeIn delay={0.2}>
          <div className="rounded-2xl border border-drift-cyan/50 bg-[#0D1524] p-6 md:p-8 backdrop-blur-md space-y-6 shadow-[0_0_35px_rgba(0,240,255,0.12)] relative overflow-hidden">
            <div className="absolute top-0 right-0 h-32 w-32 bg-drift-cyan/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between pb-4 border-b border-drift-cyan/30">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-drift-cyan/40 bg-drift-cyan/10 text-drift-cyan">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">DRIFT Contract Sentinel</h3>
                  <p className="text-xs text-drift-cyan font-mono">AST + Shadow Traffic Replay</p>
                </div>
              </div>
              <Badge variant="default" className="shadow-cyan-glow">CONTRACT AWARE</Badge>
            </div>

            <ul className="space-y-4 text-xs text-slate-200">
              <li className="flex items-start space-x-3">
                <Check className="h-4 w-4 text-drift-cyan shrink-0 mt-0.5" />
                <span><strong className="text-white">Runtime compatibility replay:</strong> Replays live production traffic against candidate contracts.</span>
              </li>
              <li className="flex items-start space-x-3">
                <Check className="h-4 w-4 text-drift-cyan shrink-0 mt-0.5" />
                <span><strong className="text-white">Downstream blast radius:</strong> Pinpoints exact client SDKs and mobile builds affected.</span>
              </li>
              <li className="flex items-start space-x-3">
                <Check className="h-4 w-4 text-drift-cyan shrink-0 mt-0.5" />
                <span><strong className="text-white">Zero noise guarantee:</strong> Filters non-breaking additions & internal comment changes.</span>
              </li>
              <li className="flex items-start space-x-3">
                <Check className="h-4 w-4 text-drift-cyan shrink-0 mt-0.5" />
                <span><strong className="text-white">CI/CD Automated Gate:</strong> Blocks PR merges containing verified critical breaking bugs.</span>
              </li>
            </ul>

            <div className="p-4 rounded-xl border border-drift-cyan/30 bg-drift-cyan/10 font-mono text-xs text-drift-cyan">
              <code>Result: 1 Verified Critical Breaking Regression Detected in 142ms</code>
            </div>
          </div>
        </FadeIn>
      </div>
    </SectionContainer>
  );
}
