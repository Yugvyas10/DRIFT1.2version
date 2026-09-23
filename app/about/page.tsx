'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Cpu, Activity, GitBranch } from 'lucide-react';
import { PageHero } from '@/components/site/page-hero';
import { Reveal, SectionHeading, GlowCard, StaggerGroup, staggerItem } from '@/components/site/primitives';
import { motion } from 'framer-motion';

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Engineering Motivation"
        title={
          <>
            Eliminating API Regressions <br />
            <span className="gradient-text">Before Production.</span>
          </>
        }
        description="Traditional static OpenAPI diff tools catch syntax changes, but miss runtime behavioral failures. DRIFT was created to unify AST contract dereferencing with shadow traffic replay."
      >
        <div className="flex justify-center gap-4">
          <Link
            href="/register"
            className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all duration-300 hover:shadow-[0_0_40px_-6px_hsl(174_72%_51%/0.6)]"
          >
            Get started free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </PageHero>

      <section className="section-pad relative">
        <div className="container-max space-y-12">
          <SectionHeading
            eyebrow="Technical Philosophy"
            title={
              <>
                Structural vs Behavioral <span className="gradient-text">Compatibility</span>
              </>
            }
            description="Why real compatibility protection requires measuring both schemas and actual client traffic."
          />

          <StaggerGroup stagger={0.15} className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <motion.div variants={staggerItem} className="h-full">
              <GlowCard className="space-y-4 h-full">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Cpu className="h-6 w-6" />
                </div>
                <h3 className="font-display text-xl font-semibold">1. Structural AST Dereferencing</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Our WebAssembly engine parses OpenAPI 3.0 and 3.1 specifications into normalized AST trees, dereferencing circular $ref components to calculate exact parameter, endpoint, and response deltas.
                </p>
              </GlowCard>
            </motion.div>

            <motion.div variants={staggerItem} className="h-full">
              <GlowCard className="space-y-4 h-full" glow="blue">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-chart-2/10 text-chart-2 ring-1 ring-chart-2/20">
                  <Activity className="h-6 w-6" />
                </div>
                <h3 className="font-display text-xl font-semibold">2. Behavioral Shadow Replay</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  eBPF network probes mirror sanitized production payloads against candidate environment builds to prove whether live requests succeed or fail against candidate schemas.
                </p>
              </GlowCard>
            </motion.div>
          </StaggerGroup>
        </div>
      </section>
    </>
  );
}
