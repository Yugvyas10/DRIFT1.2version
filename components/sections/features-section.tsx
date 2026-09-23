"use client";

import React from "react";
import { Cpu, Network, ShieldCheck, FileText, GitBranch, Share2 } from "lucide-react";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionTitle } from "@/components/ui/section-title";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { FadeIn } from "@/components/animations/fade-in";

export function FeaturesSection() {
  return (
    <SectionContainer id="features">
      <SectionTitle
        badge="Platform Capabilities"
        title="Enterprise-Grade Sentinel Architecture"
        subtitle="Designed from the ground up for high-throughput microservice architectures and zero-friction CI/CD integration."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Large Feature Card 1 */}
        <FadeIn delay={0.1} className="md:col-span-2">
          <SpotlightCard spotlightColor="rgba(0, 240, 255, 0.18)">
            <div className="flex flex-col justify-between h-full space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-drift-cyan/40 bg-drift-cyan/10 text-drift-cyan">
                  <Cpu className="h-6 w-6" />
                </div>
                <span className="font-mono text-[10px] uppercase text-drift-cyan bg-drift-cyan/10 px-2.5 py-1 rounded-full border border-drift-cyan/30">
                  WASM AST Engine
                </span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Structural AST Diff Engine</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  Parses complex OpenAPI 3.0 & 3.1 specifications into dereferenced AST nodes, accurately evaluating schema type alterations, enum modifications, and optional parameter constraints.
                </p>
              </div>
            </div>
          </SpotlightCard>
        </FadeIn>

        {/* Feature Card 2 */}
        <FadeIn delay={0.2}>
          <SpotlightCard spotlightColor="rgba(112, 0, 255, 0.18)">
            <div className="space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-drift-purple/40 bg-drift-purple/10 text-drift-purple">
                <Network className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Shadow Traffic Replay</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Captures and sanitizes production traffic with eBPF probes, replaying real HTTP payloads against candidate contracts without user impact.
              </p>
            </div>
          </SpotlightCard>
        </FadeIn>

        {/* Feature Card 3 */}
        <FadeIn delay={0.3}>
          <SpotlightCard spotlightColor="rgba(0, 82, 255, 0.18)">
            <div className="space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-drift-blue/40 bg-drift-blue/10 text-drift-blue">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-white">ML Compatibility Classifier</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Categorizes API modifications into non-breaking enhancements, deprecation warnings, and blocking critical breaking regressions.
              </p>
            </div>
          </SpotlightCard>
        </FadeIn>

        {/* Large Feature Card 4 */}
        <FadeIn delay={0.4} className="md:col-span-2">
          <SpotlightCard spotlightColor="rgba(0, 240, 255, 0.18)">
            <div className="flex flex-col justify-between h-full space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                  <GitBranch className="h-6 w-6" />
                </div>
                <span className="font-mono text-[10px] uppercase text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                  Automated CI Gate
                </span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">GitHub PR Checks & CI/CD Integration</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  Injects inline PR code review comments directly into GitHub, GitLab, and Bitbucket, blocking merges when critical breaking API changes are detected.
                </p>
              </div>
            </div>
          </SpotlightCard>
        </FadeIn>
      </div>
    </SectionContainer>
  );
}
