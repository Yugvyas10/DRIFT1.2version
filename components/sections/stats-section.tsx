"use client";

import React from "react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { SectionContainer } from "@/components/layout/section-container";
import { FadeIn } from "@/components/animations/fade-in";

export function StatsSection() {
  return (
    <SectionContainer className="py-12 border-y border-slate-800/60 bg-[#080C14]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        <FadeIn delay={0}>
          <div className="space-y-2">
            <div className="text-3xl sm:text-4xl md:text-5xl text-drift-cyan">
              <AnimatedCounter numericValue={1} suffix="M+" />
            </div>
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-300">
              Requests Analysed
            </p>
            <p className="text-[11px] text-slate-500">Per production replay batch</p>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="space-y-2">
            <div className="text-3xl sm:text-4xl md:text-5xl text-white">
              <AnimatedCounter numericValue={99.9} decimals={1} suffix="%" />
            </div>
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-300">
              Contract Accuracy
            </p>
            <p className="text-[11px] text-slate-500">Zero false positive diffs</p>
          </div>
        </FadeIn>

        <FadeIn delay={0.2}>
          <div className="space-y-2">
            <div className="text-3xl sm:text-4xl md:text-5xl text-drift-purple">
              <AnimatedCounter numericValue={85} suffix="%" />
            </div>
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-300">
              Regression Detection
            </p>
            <p className="text-[11px] text-slate-500">Improvement vs manual QA</p>
          </div>
        </FadeIn>

        <FadeIn delay={0.3}>
          <div className="space-y-2">
            <div className="text-3xl sm:text-4xl md:text-5xl text-drift-cyan">
              <AnimatedCounter numericValue={1} prefix="< " suffix=" min" />
            </div>
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-300">
              Analysis Time
            </p>
            <p className="text-[11px] text-slate-500">Automated CI execution</p>
          </div>
        </FadeIn>
      </div>
    </SectionContainer>
  );
}
