'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Cpu,
  GitBranch,
  Boxes,
  Terminal,
  Database,
  Network,
  Gauge,
  Lock,
  Code2,
  Layers,
  ArrowRight,
  ShieldCheck,
  FileCode,
} from 'lucide-react';
import {
  Reveal,
  StaggerGroup,
  staggerItem,
  SectionHeading,
  GlowCard,
  Parallax,
} from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';
import { TrafficReplayVisualizer } from '@/components/technology/traffic-replay-visualizer';
import { ArchitectureDiagram } from '@/components/technology/architecture-diagram';
import { CoreTechGrid } from '@/components/technology/core-tech-grid';
import { Button } from '@/components/ui/button';

const layers = [
  {
    icon: Code2,
    name: 'Contract Ingestion',
    desc: 'Parses OpenAPI 3.x, gRPC proto, GraphQL SDL, and AsyncAPI into a unified intermediate representation.',
    tag: 'Rust + WASM',
  },
  {
    icon: GitBranch,
    name: 'Semantic Diff Engine',
    desc: 'Computes type-aware, field-level diffs. Classifies every change as breaking, compatible, or cosmetic.',
    tag: 'Rust core',
  },
  {
    icon: Network,
    name: 'Consumer Graph',
    desc: 'Maps which downstream services depend on each field, so impact is always contextual.',
    tag: 'PostgreSQL + pgvector',
  },
  {
    icon: Gauge,
    name: 'Live Drift Monitor',
    desc: 'Continuously samples production traffic and compares observed shapes against the contract.',
    tag: 'Edge runtime',
  },
];

const specs = [
  { label: 'Diff latency (10k endpoints)', value: '< 800ms' },
  { label: 'Contract size limit', value: 'Unlimited' },
  { label: 'Supported specs', value: 'OpenAPI · gRPC · GraphQL · AsyncAPI' },
  { label: 'CI integrations', value: 'GitHub · GitLab · CircleCI · Jenkins' },
  { label: 'Deployment', value: 'Cloud · Self-hosted · Air-gapped' },
  { label: 'Compliance', value: 'SOC 2 II · GDPR · HIPAA-ready' },
];

const codeSnippet = `// drift.config.ts
import { defineConfig } from '@drift/sdk';

export default defineConfig({
  contract: './openapi.yaml',
  consumers: ['./consumers/**/*.proto'],
  rules: {
    breaking: 'block',        // gate merges on breaking changes
    compatible: 'warn',       // comment on compatible changes
    cosmetic: 'ignore',       // silent on cosmetic changes
  },
  monitor: {
    production: true,
    sampleRate: 0.02,
  },
});`;

export default function TechnologyPage() {
  return (
    <>
      <PageHero
        eyebrow="Technology"
        title={
          <>
            An engine that <span className="gradient-text">understands</span> your API.
          </>
        }
        description="DRIFT is built on a Rust-powered semantic diff core, a consumer dependency graph, and a live drift monitor — all designed for sub-second analysis at any scale."
      >
        <div className="flex flex-col items-center gap-3 sm:flex-row justify-center">
          <Link
            href="/docs"
            className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_40px_-6px_hsl(174_72%_51%/0.6)]"
          >
            Read the docs
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/interactive-pipeline"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-6 py-3.5 text-sm font-semibold text-foreground transition-all hover:border-primary/40"
          >
            Explore the pipeline
          </Link>
        </div>
      </PageHero>

      {/* Architecture layers */}
      <section className="section-pad relative">
        <div className="container-max">
          <SectionHeading
            eyebrow="Architecture"
            title={
              <>
                Four layers, <span className="gradient-text">one verdict.</span>
              </>
            }
            description="Each layer is independently deployable and horizontally scalable. Together they form a real-time regression analysis pipeline."
          />
          <div className="mt-16 space-y-4">
            {layers.map((layer, i) => (
              <Reveal key={layer.name} delay={i * 0.06} variant={i % 2 === 0 ? 'left' : 'right'}>
                <div className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl glass-panel p-6 transition-all duration-300 hover:border-primary/40 hover:shadow-[0_12px_40px_-12px_hsl(174_72%_51%/0.15)] sm:flex-row sm:items-center">
                  <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-transparent via-primary/0 to-transparent transition-colors duration-500 group-hover:via-primary/40" />
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-all duration-300 group-hover:scale-110 group-hover:shadow-[0_0_20px_-4px_hsl(174_72%_51%/0.5)]">
                      <layer.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="font-display text-lg font-semibold tracking-tight">
                          {layer.name}
                        </h3>
                        <span className="rounded-full border border-border bg-secondary/60 px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {layer.tag}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                        {layer.desc}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:pl-6">
                    <span className="font-mono text-5xl font-semibold text-border transition-all duration-500 group-hover:text-primary/40">
                      0{i + 1}
                    </span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Traffic Replay Engine Visualizer Showcase */}
      <section className="section-pad relative bg-background-2/30">
        <div className="container-max space-y-8">
          <SectionHeading
            eyebrow="Shadow Replay Simulation"
            title={
              <>
                Live Traffic Replay <span className="gradient-text">Visualizer</span>
              </>
            }
            description="Watch real-time HTTP requests flowing through candidate OpenAPI contracts with instant breaking change detection."
          />
          <Reveal variant="scale">
            <TrafficReplayVisualizer />
          </Reveal>
        </div>
      </section>

      {/* 6-Stage Execution Pipeline Grid */}
      <section className="section-pad relative">
        <div className="container-max space-y-8">
          <SectionHeading
            eyebrow="Sentinel Stages"
            title={
              <>
                Interactive Pipeline <span className="gradient-text">Stages</span>
              </>
            }
            description="Inspect AST dereferencing, traffic replay, and classification output across all execution steps."
          />
          <CoreTechGrid />
        </div>
      </section>

      {/* Architecture Diagram */}
      <section className="section-pad relative bg-background-2/30">
        <div className="container-max space-y-8">
          <SectionHeading
            eyebrow="System Design"
            title={
              <>
                End-to-End Sentinel <span className="gradient-text">Architecture</span>
              </>
            }
            description="Inspect dereferencing specs, eBPF probes, and multi-format report generators."
          />
          <Reveal variant="scale">
            <ArchitectureDiagram />
          </Reveal>
        </div>
      </section>

      {/* Code + specs */}
      <section className="section-pad relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 dot-bg opacity-20" />
        <div className="container-max relative grid gap-12 lg:grid-cols-2 lg:items-center">
          <Reveal variant="left">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
                <Terminal className="h-3.5 w-3.5" /> Configuration
              </span>
              <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight sm:text-4xl text-balance">
                One config file. Total control.
              </h2>
              <p className="mt-4 text-base text-muted-foreground leading-relaxed">
                DRIFT reads a single TypeScript config to understand your
                contract, your consumers, and your team&apos;s tolerance for each
                change class. Ship it to CI in minutes.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {['Breaking → block', 'Compatible → warn', 'Cosmetic → ignore'].map(
                  (rule) => (
                    <span
                      key={rule}
                      className="rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-300 hover:border-primary/30 hover:text-foreground"
                    >
                      {rule}
                    </span>
                  )
                )}
              </div>
            </div>
          </Reveal>
          <Reveal variant="scale" delay={0.1}>
            <Parallax speed={0.12}>
              <div className="rounded-2xl glass-panel overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-[0_16px_50px_-16px_hsl(174_72%_51%/0.2)]">
                <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-destructive/60" />
                    <span className="h-3 w-3 rounded-full bg-chart-3/60" />
                    <span className="h-3 w-3 rounded-full bg-primary/60" />
                  </div>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    drift.config.ts
                  </span>
                </div>
                <pre className="overflow-x-auto p-5 text-sm leading-relaxed">
                  <code className="font-mono text-muted-foreground">{codeSnippet}</code>
                </pre>
              </div>
            </Parallax>
          </Reveal>
        </div>
      </section>

      {/* Specs grid */}
      <section className="section-pad relative">
        <div className="container-max">
          <SectionHeading
            eyebrow="Specifications"
            title={
              <>
                Built for <span className="gradient-text">any scale.</span>
              </>
            }
          />
          <StaggerGroup className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {specs.map((s) => (
              <motion.div key={s.label} variants={staggerItem}>
                <GlowCard glow="none" className="h-full">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="mt-2 font-display text-lg font-semibold text-foreground">
                    {s.value}
                  </p>
                </GlowCard>
              </motion.div>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* Pillars */}
      <section className="section-pad relative">
        <div className="container-max">
          <StaggerGroup stagger={0.12} className="grid gap-5 md:grid-cols-3">
            {[
              { icon: Cpu, title: 'Rust-powered core', desc: 'The diff engine is pure Rust, compiled to WASM for the browser and native for CI.' },
              { icon: Lock, title: 'Zero-trust by design', desc: 'Self-hosted or cloud — your contract never leaves your network unless you choose.' },
              { icon: Boxes, title: 'Spec-agnostic', desc: 'One mental model across OpenAPI, gRPC, GraphQL, and AsyncAPI.' },
            ].map((p) => (
              <motion.div key={p.title} variants={staggerItem}>
                <div className="group flex h-full flex-col gap-3 rounded-2xl glass-panel p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_12px_40px_-12px_hsl(174_72%_51%/0.15)]">
                  <p.icon className="h-7 w-7 text-primary transition-transform duration-300 group-hover:scale-110" />
                  <h3 className="font-display text-lg font-semibold">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                </div>
              </motion.div>
            ))}
          </StaggerGroup>
        </div>
      </section>
    </>
  );
}
