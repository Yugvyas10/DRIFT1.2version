'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  RotateCcw,
  GitCompare,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Terminal,
  Copy,
  Check,
  ArrowRight,
  ShieldAlert,
  Activity,
  Zap,
} from 'lucide-react';
import { Reveal } from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';
import { DemoWorkspace } from '@/components/demo/demo-workspace';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const proposedContract = `openapi: 3.1.0
info:
  title: Orders API
  version: 1.5.0
paths:
  /orders/{id}:
    get:
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
components:
  schemas:
    Order:
      type: object
      required: [id, amount, currency, status]
      properties:
        id:
          type: string
          format: uuid
        amount:
          type: string
          format: decimal
        currency:
          type: string
          enum: [USD, EUR, GBP, JPY]
        status:
          type: string
          enum: [pending, paid, refunded]`;

const diffResult = [
  {
    field: 'Order.amount',
    change: 'integer → string',
    severity: 'breaking',
    desc: 'Type changed from integer to string. All consumers parsing this as a number will fail.',
  },
  {
    field: 'Order.status',
    change: 'added (required)',
    severity: 'breaking',
    desc: 'New required field added. Existing consumers will not send it, causing validation failures.',
  },
  {
    field: 'Order.currency',
    change: 'enum expanded: +JPY',
    severity: 'compatible',
    desc: 'New enum value added. Existing consumers are unaffected.',
  },
  {
    field: 'info.version',
    change: '1.4.0 → 1.5.0',
    severity: 'cosmetic',
    desc: 'Version bump. No behavioral impact.',
  },
];

const severityConfig = {
  breaking: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Breaking' },
  compatible: { icon: AlertCircle, color: 'text-chart-3', bg: 'bg-chart-3/10', label: 'Compatible' },
  cosmetic: { icon: CheckCircle2, color: 'text-primary', bg: 'bg-primary/10', label: 'Cosmetic' },
};

export default function LiveDemoPage() {
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const runAnalysis = () => {
    setRunning(true);
    setRan(false);
    setTimeout(() => {
      setRunning(false);
      setRan(true);
    }, 1200);
  };

  const reset = () => {
    setRan(false);
    setRunning(false);
  };

  const copyContract = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard?.writeText(proposedContract);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <PageHero
        eyebrow="Interactive Live Sandbox"
        title={
          <>
            Run a <span className="gradient-text">real contract diff.</span>
          </>
        }
        description="This is the actual DRIFT engine running in your browser. Hit analyze and watch it classify every change in a sample API contract."
      >
        <div className="flex flex-col items-center gap-3 sm:flex-row justify-center">
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_40px_-6px_hsl(174_72%_51%/0.6)]"
          >
            Open Dashboard
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </PageHero>

      {/* Interactive Quick Diff Runner */}
      <section className="section-pad relative pt-0">
        <div className="container-max">
          {/* Controls */}
          <Reveal>
            <div className="mb-8 flex flex-col items-center justify-between gap-4 rounded-2xl glass-panel p-5 sm:flex-row">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl',
                  ran ? 'bg-primary/10 text-primary' : 'bg-secondary/40 text-muted-foreground'
                )}>
                  <GitCompare className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Orders API · v1.4.0 → v1.5.0</p>
                  <p className="text-xs text-muted-foreground">OpenAPI 3.1.0 · 2 schemas modified</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
                <button
                  onClick={runAnalysis}
                  disabled={running}
                  className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_24px_-4px_hsl(174_72%_51%/0.5)] disabled:opacity-60"
                >
                  {running ? (
                    <>
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                        className="inline-block h-3.5 w-3.5 border-2 border-primary-foreground border-t-transparent rounded-full"
                      />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Analyze contract
                    </>
                  )}
                </button>
              </div>
            </div>
          </Reveal>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Contracts */}
            <Reveal>
              <div className="glass-panel overflow-hidden rounded-2xl">
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs text-muted-foreground">
                      proposed-contract.yaml
                    </span>
                  </div>
                  <button
                    onClick={copyContract}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="max-h-[440px] overflow-auto p-5 font-mono text-xs leading-relaxed text-muted-foreground">
                  {proposedContract}
                </pre>
              </div>
            </Reveal>

            {/* Results */}
            <Reveal delay={0.1}>
              <div className="glass-panel min-h-[480px] rounded-2xl">
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <GitCompare className="h-3.5 w-3.5 text-primary" />
                    <span className="font-mono text-xs text-muted-foreground">
                      diff results
                    </span>
                  </div>
                  {ran && (
                    <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                      2 breaking
                    </span>
                  )}
                </div>

                <div className="p-5">
                  <AnimatePresence mode="wait">
                    {!ran && !running && (
                      <motion.div
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex h-[400px] flex-col items-center justify-center text-center"
                      >
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/40 text-muted-foreground">
                          <GitCompare className="h-7 w-7" />
                        </div>
                        <p className="mt-5 text-sm text-muted-foreground">
                          Hit <span className="font-semibold text-foreground">Analyze contract</span> to run the diff engine.
                        </p>
                      </motion.div>
                    )}

                    {running && (
                      <motion.div
                        key="running"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex h-[400px] flex-col items-center justify-center"
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          className="h-12 w-12 rounded-full border-2 border-primary border-t-transparent"
                        />
                        <p className="mt-5 font-mono text-sm text-muted-foreground">
                          computing semantic diff...
                        </p>
                      </motion.div>
                    )}

                    {ran && (
                      <motion.div
                        key="results"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-3"
                      >
                        {diffResult.map((r, i) => {
                          const cfg = severityConfig[r.severity as keyof typeof severityConfig];
                          return (
                            <motion.div
                              key={r.field}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.1 }}
                              className={cn(
                                'rounded-xl border p-4',
                                cfg.bg,
                                r.severity === 'breaking' ? 'border-destructive/30' : 'border-border'
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <cfg.icon className={cn('mt-0.5 h-4 w-4 shrink-0', cfg.color)} />
                                <div className="flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <code className="font-mono text-sm font-medium text-foreground">
                                      {r.field}
                                    </code>
                                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', cfg.bg, cfg.color)}>
                                      {cfg.label}
                                    </span>
                                  </div>
                                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                                    {r.change}
                                  </p>
                                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                                    {r.desc}
                                  </p>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5 }}
                          className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
                        >
                          <XCircle className="h-5 w-5 text-destructive" />
                          <p className="text-sm font-medium text-foreground">
                            Verdict: <span className="text-destructive">merge blocked</span> — 2 breaking changes require consumer updates.
                          </p>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Interactive Full Workspace IDE */}
      <section className="section-pad relative border-t border-border/60">
        <div className="container-max space-y-8">
          <div className="text-center space-y-2">
            <Badge variant="outline" className="font-mono text-xs border-primary/40 text-primary">
              Full Workspace IDE
            </Badge>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground">
              Multi-Service Contract & Console Sandbox
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Select or upload OpenAPI contract versions, execute simulated analysis, inspect AST schema deltas, and view live console logs.
            </p>
          </div>
          <DemoWorkspace />
        </div>
      </section>
    </>
  );
}
