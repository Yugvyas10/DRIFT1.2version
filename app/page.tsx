'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useReducedMotion,
} from 'framer-motion';
import dynamic from 'next/dynamic';
import {
  ArrowRight,
  GitBranch,
  ShieldCheck,
  Zap,
  GitCompare,
  Eye,
  Workflow,
  Activity,
  CheckCircle2,
  Terminal,
  FileCode2,
  Boxes,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  Reveal,
  StaggerGroup,
  staggerItem,
  WordReveal,
  SectionHeading,
  GlowCard,
  Marquee,
  Aurora,
  Counter,
  Magnetic,
  SectionDivider,
} from '@/components/site/primitives';
import { EASE } from '@/lib/motion';
import { cn } from '@/lib/utils';

const HeroScene = dynamic(
  () => import('@/components/site/hero-scene').then((m) => m.HeroScene),
  { ssr: false }
);

const features = [
  {
    icon: GitCompare,
    title: 'Semantic contract diffing',
    desc: 'Compare API schemas field-by-field with type-aware, breaking-vs-compatible classification. No more guessing what a changed integer means.',
  },
  {
    icon: Workflow,
    title: 'Pipeline-native integration',
    desc: 'Drop DRIFT into any CI/CD flow — GitHub Actions, GitLab, CircleCI, Jenkins. Gate merges on real contract violations, not vibes.',
  },
  {
    icon: ShieldCheck,
    title: 'Zero false positives',
    desc: 'Our contract engine understands OpenAPI, gRPC, GraphQL and AsyncAPI. Only true breaking changes surface, tuned by your team.',
  },
  {
    icon: Zap,
    title: 'Sub-second analysis',
    desc: 'Rust-powered diffing analyzes 10k-endpoint contracts in under 800ms. Your PRs never wait on the gate.',
  },
  {
    icon: Eye,
    title: 'Visual change previews',
    desc: 'Every diff renders as a cinematic, navigable change graph. Reviewers see exactly what moved, renamed, or vanished.',
  },
  {
    icon: Activity,
    title: 'Live drift monitoring',
    desc: 'Continuously compare production traffic against your contract. Catch silent drift before an integration breaks.',
  },
];

const stats = [
  { value: 10, suffix: 'k+', label: 'Endpoints analyzed per contract' },
  { value: 800, prefix: '<', suffix: 'ms', label: 'Median diff latency' },
  { value: 99.98, suffix: '%', decimals: 2, label: 'Breaking-change recall' },
  { value: 4.2, suffix: 'B', decimals: 1, label: 'API calls monitored monthly' },
];

const testimonials = [
  {
    quote:
      'DRIFT caught a breaking response-field rename that would have taken down three downstream services. It paid for itself in one PR.',
    author: 'Priya Nair',
    role: 'Staff Engineer, Vector',
  },
  {
    quote:
      'We replaced a 600-line custom diff script with DRIFT in an afternoon. The visual change graph alone is worth it.',
    author: 'Marcus Lee',
    role: 'Platform Lead, Lumen',
  },
  {
    quote:
      'The false-positive rate is genuinely zero. Our team trusts the gate now, which means the gate actually runs.',
    author: 'Sofia Reyes',
    role: 'Director of API, Northwind',
  },
];

const logos = ['VECTOR', 'LUMEN', 'NORTHWIND', 'KEPLER', 'ORBIT', 'HALCYON', 'TIDE', 'MERIDIAN'];

function PipelineDemoCard() {
  const [isBreaking, setIsBreaking] = useState(true);

  const steps = [
    { icon: GitBranch, label: 'Pull request opened', done: true },
    { icon: FileCode2, label: 'Contract extracted', done: true },
    { icon: GitCompare, label: 'Semantic diff computed', done: true },
    { icon: ShieldCheck, label: 'Breaking changes flagged', done: !isBreaking },
    { icon: CheckCircle2, label: 'Merge gated', done: !isBreaking },
  ];

  return (
    <div className="glass-panel rounded-2xl p-6 sm:p-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            Interactive PR Inspection Simulation
          </span>
        </div>
        <div className="relative flex items-center gap-2 rounded-full border border-border bg-secondary/40 p-1">
          {[
            { key: 'breaking', label: 'Breaking PR', active: isBreaking, set: () => setIsBreaking(true), cls: 'bg-destructive/20 text-destructive border border-destructive/40 font-semibold' },
            { key: 'compatible', label: 'Compatible PR', active: !isBreaking, set: () => setIsBreaking(false), cls: 'bg-primary/20 text-primary border border-primary/40 font-semibold' },
          ].map((mode) => (
            <button
              key={mode.key}
              onClick={mode.set}
              className={`relative rounded-full px-3 py-1 font-mono text-xs transition-colors ${
                mode.active
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode.active && (
                <motion.span
                  layoutId="pr-mode"
                  className={cn('absolute inset-0 rounded-full', mode.cls)}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative z-10">{mode.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-stretch">
        {steps.map((step, i) => (
          <motion.div
            key={i}
            layout
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="flex items-center gap-3.5 lg:flex-col lg:text-center p-3.5 rounded-xl bg-secondary/25 border border-border/40 hover:border-border/80 transition-colors"
          >
            <motion.div
              animate={{
                scale: step.done ? 1 : 0.94,
                opacity: step.done ? 1 : 0.75,
              }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className="relative shrink-0"
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-colors duration-300 ${
                  step.done
                    ? 'border-primary/40 bg-primary/10 text-primary shadow-[0_0_15px_-3px_hsl(174_72%_51%/0.3)]'
                    : 'border-border bg-secondary/40 text-muted-foreground'
                }`}
              >
                <step.icon className="h-5 w-5" />
              </div>
              <AnimatePresence>
                {step.done && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-foreground leading-snug">{step.label}</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {step.done ? 'Complete' : 'Blocked'}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8">
        <AnimatePresence mode="wait">
          {isBreaking ? (
            <motion.div
              key="breaking"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center"
            >
              <ShieldCheck className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm text-foreground">
                <span className="font-semibold text-destructive">
                  Breaking change detected:
                </span>{' '}
                <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-primary">
                  Order.amount
                </code>{' '}
                changed from <code className="font-mono text-xs text-muted-foreground">integer</code> to{' '}
                <code className="font-mono text-xs text-muted-foreground">string</code> — merge blocked in CI.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="compatible"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="flex flex-col items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center"
            >
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              <p className="text-sm text-foreground">
                <span className="font-semibold text-primary">
                  Compatible change verified:
                </span>{' '}
                <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-primary">
                  Order.currency
                </code>{' '}
                enum expanded — all 5 pipeline checks passed. Merged automatically.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CtaLink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Magnetic>
      <Link
        href={href}
        className={cn(
          'group inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all duration-300',
          primary
            ? 'bg-primary text-primary-foreground hover:shadow-[0_0_40px_-6px_hsl(174_72%_51%/0.6)]'
            : 'border border-border bg-secondary/40 text-foreground backdrop-blur-md hover:border-primary/40 hover:bg-secondary/60'
        )}
      >
        {children}
      </Link>
    </Magnetic>
  );
}

export default function HomePage() {
  const heroRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });

  const heroContentY = useTransform(scrollYProgress, [0, 1], [0, -140]);
  const heroContentOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const heroContentBlur = useTransform(scrollYProgress, [0, 0.9], [0, 8]);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, 1.18]);
  const sceneOpacity = useTransform(scrollYProgress, [0, 0.55], [0.3, 0]);
  const scrollHintOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);

  const heroContentStyle = reduceMotion
    ? undefined
    : { y: heroContentY, opacity: heroContentOpacity, filter: heroContentBlur };

  return (
    <>
      {/* Hero */}
      <section ref={heroRef} className="relative min-h-screen overflow-hidden">
        <Aurora />
        <div className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-30" />
        <motion.div
          style={reduceMotion ? undefined : { scale: sceneScale, opacity: sceneOpacity }}
          className="pointer-events-none absolute inset-0 z-0"
        >
          <HeroScene className="pointer-events-none absolute inset-0 opacity-30" />
        </motion.div>

        <motion.div
          style={heroContentStyle}
          className="container-max relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pt-24 sm:pt-28 md:pt-32 pb-16 text-center sm:px-8"
        >
          <motion.span
            initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.8, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-primary backdrop-blur-md"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Contract-aware regression analysis
          </motion.span>

          <WordReveal
            as="h1"
            delay={0.12}
            stagger={0.06}
            className="mt-8 max-w-4xl font-display text-5xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl md:text-7xl lg:text-8xl text-balance"
          >
            Stop API drift
            <br />
            <span className="gradient-text">before it ships.</span>
          </WordReveal>

          <motion.p
            initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, delay: 0.55, ease: EASE }}
            className="mt-7 max-w-2xl text-base text-muted-foreground sm:text-lg md:text-xl leading-relaxed"
          >
            DRIFT is the contract-aware regression engine that catches breaking
            API changes in your pull requests — with cinematic visual diffs and
            zero false positives.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, delay: 0.7, ease: EASE }}
            className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
          >
            <CtaLink href="/register" primary>
              Start free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </CtaLink>
            <CtaLink href="/live-demo">
              <Terminal className="h-4 w-4 text-primary" />
              Try the live demo
            </CtaLink>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1 }}
            className="mt-10 flex items-center gap-6 text-xs text-muted-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> No credit card
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> 14-day Pro trial
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> SOC 2 Type II
            </span>
          </motion.div>
        </motion.div>

        <motion.div
          style={reduceMotion ? undefined : { opacity: scrollHintOpacity }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="flex h-9 w-5 items-start justify-center rounded-full border border-border p-1">
            <motion.div
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="h-1.5 w-1.5 rounded-full bg-primary"
            />
          </div>
        </motion.div>
      </section>

      {/* Logo marquee */}
      <section className="relative py-16">
        <Reveal variant="fade">
          <p className="mb-8 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Trusted by API-first engineering teams
          </p>
        </Reveal>
        <Marquee hoverPause className="gap-16">
          {logos.map((logo) => (
            <span
              key={logo}
              className="font-display text-2xl font-semibold tracking-widest text-muted-foreground/50 transition-colors duration-300 hover:text-muted-foreground"
            >
              {logo}
            </span>
          ))}
        </Marquee>
      </section>

      <SectionDivider />

      {/* Features */}
      <section className="section-pad relative">
        <div className="container-max">
          <SectionHeading
            eyebrow="The platform"
            title={
              <>
                Every change, <span className="gradient-text">understood.</span>
              </>
            }
            description="DRIFT doesn't just diff text. It understands your contract — its types, its constraints, its consumers — and tells you what actually breaks."
          />
          <StaggerGroup className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <motion.div key={f.title} variants={staggerItem} className="h-full">
                <GlowCard className="h-full">
                  <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-all duration-300 group-hover:scale-110 group-hover:shadow-[0_0_20px_-4px_hsl(174_72%_51%/0.5)]">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-lg font-semibold tracking-tight">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {f.desc}
                  </p>
                </GlowCard>
              </motion.div>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* Pipeline preview */}
      <section className="section-pad relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 dot-bg opacity-20" />
        <div className="container-max relative">
          <SectionHeading
            eyebrow="How it works"
            title={
              <>
                From PR to gate in <span className="gradient-text">one breath.</span>
              </>
            }
            description="DRIFT reads your contract, computes the semantic diff, classifies every change, and gates the merge — all before your coffee cools."
          />
          <Reveal variant="scale" className="mt-16">
            <PipelineDemoCard />
          </Reveal>
        </div>
      </section>

      <SectionDivider />

      {/* Stats */}
      <section className="section-pad relative">
        <div className="container-max">
          <StaggerGroup stagger={0.12} className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <motion.div key={s.label} variants={staggerItem} className="text-center">
                <div className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  <span className="gradient-text">
                    <Counter
                      value={s.value}
                      prefix={s.prefix ?? ''}
                      suffix={s.suffix ?? ''}
                      decimals={s.decimals ?? 0}
                    />
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
              </motion.div>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section-pad relative overflow-hidden">
        <Aurora />
        <div className="container-max relative">
          <SectionHeading
            eyebrow="Loved by engineers"
            title={
              <>
                The gate that <span className="gradient-text">teams trust.</span>
              </>
            }
          />
          <StaggerGroup stagger={0.14} className="mt-16 grid gap-5 lg:grid-cols-3">
            {testimonials.map((t) => (
              <motion.div key={t.author} variants={staggerItem} className="h-full">
                <GlowCard className="flex h-full flex-col">
                  <p className="flex-1 text-base text-foreground leading-relaxed">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-chart-2/20 text-sm font-semibold text-primary ring-1 ring-primary/20">
                      {t.author.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{t.author}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </GlowCard>
              </motion.div>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* CTA */}
      <section className="section-pad relative">
        <div className="container-max">
          <Reveal variant="scale">
            <div className="relative overflow-hidden rounded-3xl glass-panel p-10 text-center sm:p-16">
              <div className="pointer-events-none absolute -top-1/2 left-1/2 h-[80vh] w-[80vh] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.8, ease: EASE }}
                className="relative"
              >
                <Layers className="mx-auto h-10 w-10 text-primary" />
                <h2 className="mt-6 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl text-balance">
                  Ship APIs that don&apos;t break.
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
                  Join the teams who stopped firefighting API regressions and
                  started preventing them.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <CtaLink href="/register" primary>
                    Start free
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </CtaLink>
                  <CtaLink href="/contact">
                    <Boxes className="h-4 w-4 text-primary" />
                    Talk to sales
                  </CtaLink>
                </div>
              </motion.div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
