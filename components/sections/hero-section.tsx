"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Play, FileCode2, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CanvasContainer } from "@/components/three/canvas-container";
import { HeroScene } from "@/components/three/hero-scene";
import { MagneticButton } from "@/components/ui/magnetic-button";
import { FadeIn } from "@/components/animations/fade-in";

export function HeroSection() {
  return (
    <section className="relative min-h-[92vh] flex items-center justify-center pt-32 pb-20 overflow-hidden bg-radial-gradient">
      {/* 3D Node Mesh Scene Ambient Background */}
      <CanvasContainer className="absolute inset-0 pointer-events-auto opacity-10 z-0">
        <HeroScene />
      </CanvasContainer>

      {/* Volumetric Ambient Lighting Layers */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] rounded-full bg-gradient-to-tr from-drift-cyan/08 via-drift-purple/04 to-transparent blur-[160px] pointer-events-none z-0" />

      {/* Organic Headline Layout without Box Container */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          <FadeIn>
            <div className="inline-flex items-center space-x-2.5 rounded-full border border-drift-cyan/25 bg-drift-cyan/10 px-4 py-1.5 backdrop-blur-md shadow-[0_0_25px_rgba(0,240,255,0.15)]">
              <Sparkles className="h-4 w-4 text-drift-cyan animate-pulse" />
              <span className="font-mono text-xs font-semibold text-drift-cyan tracking-wide">
                Contract-Aware API Sentinel v1.4
              </span>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-white leading-[1.06]">
              Know Every Breaking <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-drift-cyan via-white to-drift-purple">
                API Change
              </span>{" "}
              Before Your Users Do.
            </h1>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p className="text-base sm:text-lg md:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed font-sans font-normal drop-shadow-md">
              DRIFT intelligently compares OpenAPI contracts, replays shadow production traffic, and classifies which API changes are truly breaking before deployment.
            </p>
          </FadeIn>

          <FadeIn delay={0.3}>
            <div className="flex flex-wrap items-center justify-center gap-5 pt-4">
              <MagneticButton>
                <Button size="lg" asChild variant="default" className="shadow-cyan-glow h-13 px-9 text-base font-semibold">
                  <Link href="/live-demo">
                    <Play className="mr-2 h-4 w-4" /> Try Interactive Demo
                  </Link>
                </Button>
              </MagneticButton>
              <MagneticButton>
                <Button size="lg" asChild variant="glass" className="h-13 px-9 text-base font-semibold border-slate-700/80">
                  <Link href="/docs">
                    <FileCode2 className="mr-2 h-4 w-4 text-drift-cyan" /> View Documentation
                  </Link>
                </Button>
              </MagneticButton>
            </div>
          </FadeIn>

          {/* Floating Telemetry Callouts Banner */}
          <FadeIn delay={0.4}>
            <div className="pt-12 flex items-center justify-center space-x-6 sm:space-x-12 text-slate-400 font-mono text-xs">
              <div className="flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Zero Latency Replay</span>
              </div>
              <div className="flex items-center space-x-2">
                <ShieldAlert className="h-4 w-4 text-drift-cyan" />
                <span>OpenAPI 3.0 & 3.1 AST</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-white font-bold">100%</span>
                <span>CI/CD Automated</span>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
