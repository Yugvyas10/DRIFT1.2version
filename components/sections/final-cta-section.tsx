"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, FileCode2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MagneticButton } from "@/components/ui/magnetic-button";
import { FadeIn } from "@/components/animations/fade-in";

export function FinalCtaSection() {
  return (
    <section className="relative py-28 md:py-36 overflow-hidden bg-radial-gradient border-t border-slate-800">
      {/* Animated Aurora Radial Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[700px] rounded-full bg-gradient-to-r from-drift-cyan/20 via-drift-purple/20 to-drift-blue/20 blur-[130px] pointer-events-none animate-pulse" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        <div className="max-w-4xl mx-auto space-y-6">
          <FadeIn>
            <div className="inline-flex items-center space-x-2 rounded-full border border-drift-cyan/30 bg-drift-cyan/10 px-4 py-1.5 backdrop-blur-md">
              <ShieldCheck className="h-4 w-4 text-drift-cyan" />
              <span className="font-mono text-xs font-semibold text-drift-cyan">
                Deploy Sentinel to Your CI/CD Mesh Today
              </span>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-white leading-tight">
              Stop Shipping <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-drift-cyan via-white to-drift-purple">
                Blind API Changes.
              </span>
            </h2>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Join enterprise API teams using DRIFT to compare OpenAPI contracts, replay shadow production traffic, and guarantee 100% contract confidence before every release.
            </p>
          </FadeIn>

          <FadeIn delay={0.3}>
            <div className="flex flex-wrap items-center justify-center gap-5 pt-6">
              <MagneticButton>
                <Button size="lg" asChild variant="default" className="shadow-cyan-glow h-12 px-8 text-base font-semibold">
                  <Link href="/register">
                    <span>Start Free Trial</span>
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </MagneticButton>
              <MagneticButton>
                <Button size="lg" asChild variant="glass" className="h-12 px-8 text-base border-slate-700">
                  <Link href="/docs">
                    <FileCode2 className="mr-2 h-4 w-4 text-drift-cyan" /> Read Documentation
                  </Link>
                </Button>
              </MagneticButton>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
