'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Book,
  Terminal,
  GitBranch,
  ShieldCheck,
  Code2,
  Zap,
  Search,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { DocsSidebar } from '@/components/docs/docs-sidebar';
import { DocsToc } from '@/components/docs/docs-toc';
import { DocsSearchModal } from '@/components/docs/docs-search-modal';
import { DocsCallout } from '@/components/docs/docs-callout';
import { CliReferenceView } from '@/components/docs/cli-reference-view';
import { DocsPlayground } from '@/components/docs/docs-playground';
import { FaqAccordion } from '@/components/docs/faq-accordion';
import { ChangelogTimeline } from '@/components/docs/changelog-timeline';
import { DocsAiAssistant } from '@/components/docs/docs-ai-assistant';
import { PageHero } from '@/components/site/page-hero';
import { Reveal } from '@/components/site/primitives';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const sections = [
  {
    icon: Book,
    title: 'Getting started',
    items: ['Installation', 'Quick start', 'Your first contract', 'Configuration'],
  },
  {
    icon: GitBranch,
    title: 'CI/CD integration',
    items: ['GitHub Actions', 'GitLab CI', 'CircleCI', 'Jenkins'],
  },
  {
    icon: ShieldCheck,
    title: 'Rules & policies',
    items: ['Breaking changes', 'Compatible changes', 'Custom rules', 'Consumer graphs'],
  },
  {
    icon: Code2,
    title: 'SDK reference',
    items: ['@drift/sdk', 'CLI commands', 'REST API', 'Webhooks'],
  },
];

const quickStart = `# Install the DRIFT CLI
npm install -g @drift/cli

# Initialize in your repo
drift init --contract openapi.yaml

# Run a local diff check
drift check

# Add to GitHub Actions
drift ci --provider github`;

const ghAction = `# .github/workflows/drift.yml
name: DRIFT
on: pull_request
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: drift/setup-action@v1
      - run: drift check --gate breaking`;

export default function DocsPage() {
  const [activeSectionId, setActiveSectionId] = useState('overview');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, id: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard?.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  return (
    <>
      <PageHero
        eyebrow="Documentation Platform"
        title={
          <>
            Everything you need to <span className="gradient-text">ship safely.</span>
          </>
        }
        description="Guides, references, and recipes for integrating DRIFT into your workflow — from first install to enterprise-grade policies."
      />

      <section className="section-pad relative pt-0">
        <div className="container-max">
          {/* Search bar trigger */}
          <Reveal>
            <div
              onClick={() => setIsSearchOpen(true)}
              className="mb-10 flex cursor-pointer items-center gap-3 rounded-2xl glass-panel px-5 py-4 transition-colors hover:border-primary/40"
            >
              <Search className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1 text-sm text-muted-foreground">
                Search documentation, CLI reference, and guides...
              </span>
              <kbd className="hidden rounded-md border border-border bg-secondary/60 px-2 py-1 font-mono text-xs text-muted-foreground sm:inline-block">
                ⌘K
              </kbd>
            </div>
          </Reveal>

          <div className="grid gap-8 lg:grid-cols-[260px_1fr_200px]">
            {/* Sticky Left Sidebar */}
            <Reveal>
              <DocsSidebar
                activeSectionId={activeSectionId}
                onSelectSection={setActiveSectionId}
                className="sticky top-24 hidden md:block"
              />
            </Reveal>

            {/* Center Main Documentation Area */}
            <div className="min-w-0 space-y-8">
              <Reveal>
                <div className="glass-panel rounded-2xl p-8 space-y-6">
                  {/* Overview Section */}
                  {activeSectionId === 'overview' && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Platform</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-foreground">Overview</span>
                      </div>

                      <h1 className="font-display text-3xl font-semibold tracking-tight">
                        Platform Overview
                      </h1>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        DRIFT is a Contract-Aware API Regression Sentinel designed to compare OpenAPI specifications, replay production traffic against candidate contracts, classify compatibility changes, and block breaking mutations in CI/CD pipelines.
                      </p>

                      <DocsCallout type="tip" title="Core Philosophy">
                        DRIFT combines AST structural parsing with eBPF shadow traffic replay. While static OpenAPI diff tools catch syntax changes, DRIFT measures the runtime impact on actual client workloads.
                      </DocsCallout>

                      <div className="my-6 hairline" />

                      <h2 className="font-display text-xl font-semibold">Quick Start Commands</h2>
                      <div className="group relative mt-4 overflow-hidden rounded-xl border border-border bg-background/60">
                        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
                          <span className="font-mono text-xs text-muted-foreground">terminal</span>
                          <button
                            onClick={() => copy(quickStart, 'qs')}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            {copied === 'qs' ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                        <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-foreground/90">
                          {quickStart}
                        </pre>
                      </div>

                      <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <div className="flex items-start gap-3">
                          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <div>
                            <p className="text-sm font-semibold text-foreground">Pro tip</p>
                            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                              Run <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-primary">drift check --watch</code> during local development to get instant feedback as you edit your contract.
                            </p>
                          </div>
                        </div>
                      </div>

                      <h2 className="mt-8 font-display text-xl font-semibold">GitHub Actions Integration</h2>
                      <div className="group relative mt-4 overflow-hidden rounded-xl border border-border bg-background/60">
                        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
                          <span className="font-mono text-xs text-muted-foreground">.github/workflows/drift.yml</span>
                          <button
                            onClick={() => copy(ghAction, 'gh')}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            {copied === 'gh' ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                        <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-foreground/90">
                          {ghAction}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Installation Section */}
                  {(activeSectionId === 'overview' || activeSectionId === 'installation') && (
                    <div id="installation" className="space-y-4 pt-6 border-t border-border/60">
                      <h3 className="font-display text-xl font-semibold">Installation & Setup</h3>
                      <p className="text-sm text-muted-foreground">Install the DRIFT CLI globally via npm or Docker binary.</p>
                      <div className="group relative overflow-hidden rounded-xl border border-border bg-background/60 p-4">
                        <code className="font-mono text-xs text-primary">npm install -g @drift/cli</code>
                      </div>
                    </div>
                  )}

                  {/* CLI Reference Section */}
                  {(activeSectionId === 'overview' || activeSectionId === 'cli') && (
                    <div id="cli-reference" className="space-y-6 pt-6 border-t border-border/60">
                      <CliReferenceView />
                    </div>
                  )}

                  {/* Pipeline Section */}
                  {(activeSectionId === 'overview' || activeSectionId === 'pipeline') && (
                    <div id="pipeline" className="space-y-4 pt-6 border-t border-border/60">
                      <h3 className="font-display text-xl font-semibold">6-Stage Execution Pipeline</h3>
                      <p className="text-sm text-muted-foreground">DRIFT evaluates contracts through 6 deterministic stages: Spec Ingestion, AST Diff, Traffic Ingestion, Shadow Replay, Severity Classification, and Multi-Format Reporting.</p>
                    </div>
                  )}

                  {/* Interactive Playground Section */}
                  {(activeSectionId === 'overview' || activeSectionId === 'playground') && (
                    <div id="playground" className="space-y-6 pt-6 border-t border-border/60">
                      <DocsPlayground />
                    </div>
                  )}

                  {/* FAQ Section */}
                  {(activeSectionId === 'overview' || activeSectionId === 'faq') && (
                    <div id="faq" className="space-y-6 pt-6 border-t border-border/60">
                      <h3 className="font-display text-xl font-semibold">Frequently Asked Questions</h3>
                      <FaqAccordion />
                    </div>
                  )}

                  {/* Changelog Section */}
                  {(activeSectionId === 'overview' || activeSectionId === 'changelog') && (
                    <div id="changelog" className="space-y-6 pt-6 border-t border-border/60">
                      <h3 className="font-display text-xl font-semibold">Platform Release Changelog</h3>
                      <ChangelogTimeline />
                    </div>
                  )}
                </div>
              </Reveal>

              {/* Help cards */}
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { icon: ExternalLink, title: 'API reference', desc: 'Full REST & SDK reference' },
                  { icon: Terminal, title: 'CLI guide', desc: 'Every command, explained' },
                ].map((c, i) => (
                  <Reveal key={c.title} delay={i * 0.08}>
                    <button className="group flex w-full items-center gap-4 rounded-2xl glass-panel p-5 text-left transition-all hover:border-primary/40">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <c.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{c.title}</p>
                        <p className="text-xs text-muted-foreground">{c.desc}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </button>
                  </Reveal>
                ))}
              </div>
            </div>

            {/* Sticky Right Table of Contents */}
            <DocsToc className="sticky top-24 hidden lg:block" />
          </div>
        </div>
      </section>

      {/* Search Modal & Floating AI Assistant */}
      <DocsSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectResult={(id) => setActiveSectionId(id)}
      />
      <DocsAiAssistant />

      {/* Final Transition CTA */}
      <section className="relative py-24 border-t border-border/60 bg-background-2/40">
        <div className="container-max text-center space-y-6">
          <Reveal>
            <Badge variant="outline" className="font-mono text-xs border-primary/40 text-primary">
              Enterprise Deployment
            </Badge>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="font-display text-3xl sm:text-5xl font-semibold text-foreground tracking-tight">
              Ready to use DRIFT in <span className="gradient-text">Your Workflow?</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-base text-muted-foreground max-w-xl mx-auto">
              Explore enterprise pricing plans, deployment options, air-gapped security, and team licenses.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="flex justify-center gap-4 pt-2">
              <Button size="lg" asChild variant="default" className="h-12 px-8">
                <Link href="/pricing">
                  <span>View Enterprise Pricing</span>
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" asChild variant="glass" className="h-12 px-8">
                <Link href="/live-demo">
                  <span>Launch Interactive Demo</span>
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
