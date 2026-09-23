"use client";

import React from "react";
import { AlertOctagon, GitPullRequest, Flame, ShieldOff } from "lucide-react";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionTitle } from "@/components/ui/section-title";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/animations/fade-in";

export function ProblemSection() {
  return (
    <SectionContainer gridBg id="problem">
      <SectionTitle
        badge="The API Versioning Trap"
        title="Why Traditional Spec Diffing Fails Modern Engineering"
        subtitle="APIs fail in production not because schemas are missing, but because subtle runtime behaviors mismatch consumer expectations."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <FadeIn delay={0.1}>
          <SpotlightCard spotlightColor="rgba(244, 63, 94, 0.15)">
            <div className="flex items-start space-x-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
                <AlertOctagon className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-white">Hidden Breaking Mutations</h3>
                  <Badge variant="breaking">CRITICAL</Badge>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Changing an integer parameter to a string or making an optional query field mandatory looks trivial in code reviews, but instantly breaks mobile apps and SDKs in the wild.
                </p>
              </div>
            </div>
          </SpotlightCard>
        </FadeIn>

        <FadeIn delay={0.2}>
          <SpotlightCard spotlightColor="rgba(245, 158, 11, 0.15)">
            <div className="flex items-start space-x-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
                <Flame className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-white">Cascading Downstream Outages</h3>
                  <Badge variant="warning">HIGH RISK</Badge>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Microservices rely on implicit response payload guarantees. A single deleted property causes unhandled NullPointerExceptions across 10+ dependent consumer services.
                </p>
              </div>
            </div>
          </SpotlightCard>
        </FadeIn>

        <FadeIn delay={0.3}>
          <SpotlightCard spotlightColor="rgba(168, 85, 247, 0.15)">
            <div className="flex items-start space-x-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-300">
                <GitPullRequest className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-white">Untested Edge Cases in CI</h3>
                  <Badge variant="purple">BLIND SPOT</Badge>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Unit tests and mock servers test happy-path synthetic data. They fail to validate real production request variations, headers, and unexpected client query patterns.
                </p>
              </div>
            </div>
          </SpotlightCard>
        </FadeIn>

        <FadeIn delay={0.4}>
          <SpotlightCard spotlightColor="rgba(0, 240, 255, 0.15)">
            <div className="flex items-start space-x-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-drift-cyan/30 bg-drift-cyan/10 text-drift-cyan">
                <ShieldOff className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-white">Flawed Structural JSON Diffs</h3>
                  <Badge variant="default">FALSE POSITIVES</Badge>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Traditional git diff tools highlight line movements, comment changes, and reordered keys—flooding developer channels with noisy, non-actionable alerts.
                </p>
              </div>
            </div>
          </SpotlightCard>
        </FadeIn>
      </div>
    </SectionContainer>
  );
}
