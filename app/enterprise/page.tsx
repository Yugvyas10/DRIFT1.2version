'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Building2,
  ShieldCheck,
  Lock,
  KeyRound,
  Server,
  FileCheck,
  Users,
  Headset,
  GitBranch,
  Network,
  ArrowRight,
} from 'lucide-react';
import {
  Reveal,
  StaggerGroup,
  staggerItem,
  SectionHeading,
  GlowCard,
  Counter,
  Magnetic,
} from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';

const features = [
  { icon: ShieldCheck, title: 'SOC 2 Type II', desc: 'Independently audited. Full security documentation available under NDA.' },
  { icon: KeyRound, title: 'SSO / SAML & SCIM', desc: 'Connect Okta, Azure AD, Google Workspace, or any SAML 2.0 provider. Automated provisioning via SCIM.' },
  { icon: Server, title: 'Self-hosted or air-gapped', desc: 'Deploy DRIFT in your own VPC or fully air-gapped. Your contract data never leaves your network.' },
  { icon: FileCheck, title: 'Audit logs & RBAC', desc: 'Every action is logged. Role-based access control down to the contract and consumer level.' },
  { icon: Network, title: 'Dedicated infrastructure', desc: 'Isolated compute and storage. No noisy neighbors. Optional dedicated support engineer.' },
  { icon: GitBranch, title: 'Custom CI integrations', desc: 'Beyond GitHub and GitLab — we build and maintain connectors for your internal CI system.' },
];

const stats = [
  { value: 99.99, suffix: '%', decimals: 2, label: 'Uptime SLA' },
  { value: 15, prefix: '<', suffix: 'min', label: 'Critical response time' },
  { value: 0, label: 'Data leaves your network' },
  { value: 24, suffix: '/7', label: 'Dedicated support' },
];

export default function EnterprisePage() {
  return (
    <>
      <PageHero
        eyebrow="Enterprise"
        title={
          <>
            DRIFT, <span className="gradient-text">on your terms.</span>
          </>
        }
        description="Self-hosted, air-gapped, SSO-backed, and audit-ready. The contract regression platform built for organizations that can't compromise on control."
      >
        <div className="flex flex-col items-center gap-3 sm:flex-row justify-center">
          <Link
            href="/contact"
            className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_40px_-6px_hsl(174_72%_51%/0.6)]"
          >
            Talk to our team
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-6 py-3.5 text-sm font-semibold text-foreground transition-all hover:border-primary/40"
          >
            Read security docs
          </Link>
        </div>
      </PageHero>

      {/* Stats */}
      <section className="section-pad relative">
        <div className="container-max">
          <div className="grid gap-8 rounded-2xl glass-panel p-8 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.08} variant="scale" className="text-center">
                <p className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  <span className="gradient-text">
                    <Counter
                      value={s.value}
                      prefix={s.prefix ?? ''}
                      suffix={s.suffix ?? ''}
                      decimals={s.decimals ?? 0}
                    />
                  </span>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section-pad relative">
        <div className="container-max">
          <SectionHeading
            eyebrow="Built for the enterprise"
            title={
              <>
                Control without <span className="gradient-text">complexity.</span>
              </>
            }
            description="Everything your security and platform teams need — without the integration overhead."
          />
          <StaggerGroup className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <motion.div key={f.title} variants={staggerItem}>
                <GlowCard className="h-full">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </GlowCard>
              </motion.div>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* Deployment options */}
      <section className="section-pad relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 dot-bg opacity-20" />
        <div className="container-max relative">
          <SectionHeading
            eyebrow="Deployment"
            title={
              <>
                Three ways to <span className="gradient-text">run DRIFT.</span>
              </>
            }
          />
          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {[
              { icon: Server, name: 'Cloud', desc: 'Managed by us. Zero infrastructure. Get started in minutes.', tag: 'Fastest setup' },
              { icon: Lock, name: 'Self-hosted', desc: 'Deploy in your VPC. Full control over data and compute.', tag: 'Your network' },
              { icon: ShieldCheck, name: 'Air-gapped', desc: 'Fully isolated. No internet egress. For regulated environments.', tag: 'Maximum security' },
            ].map((opt, i) => (
              <Reveal key={opt.name} delay={i * 0.08} variant={i % 2 === 0 ? 'left' : 'right'}>
                <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl glass-panel p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_16px_50px_-16px_hsl(174_72%_51%/0.15)]">
                  <opt.icon className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110" />
                  <h3 className="mt-4 font-display text-lg font-semibold">{opt.name}</h3>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground leading-relaxed">{opt.desc}</p>
                  <span className="mt-4 inline-flex w-fit rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-xs text-muted-foreground transition-colors duration-300 group-hover:border-primary/30 group-hover:text-primary">
                    {opt.tag}
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Support */}
      <section className="section-pad relative">
        <div className="container-max">
          <Reveal>
            <div className="grid gap-8 rounded-2xl glass-panel p-8 lg:grid-cols-[1fr_1fr] lg:items-center lg:p-12">
              <Reveal variant="left" delay={0.05}>
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Headset className="h-6 w-6" />
                  </div>
                  <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                    A dedicated engineer, not a ticket queue.
                  </h2>
                  <p className="mt-4 text-base text-muted-foreground leading-relaxed">
                    Enterprise customers get a named support engineer who knows your
                    contracts, your CI, and your team. Critical issues are answered
                    in under 15 minutes, 24/7.
                  </p>
                </div>
              </Reveal>
              <Reveal variant="right" delay={0.1}>
                <div className="space-y-4">
                  {[
                    { icon: Users, label: 'Named support engineer', value: 'Included' },
                    { icon: ShieldCheck, label: 'Critical response SLA', value: '< 15 min' },
                    { icon: FileCheck, label: 'Quarterly security review', value: 'Included' },
                    { icon: GitBranch, label: 'Custom CI connector', value: 'Built for you' },
                  ].map((row, i) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between rounded-xl border border-border bg-secondary/20 px-5 py-3.5 transition-all duration-300 hover:border-primary/30"
                      style={{ transitionDelay: `${i * 30}ms` }}
                    >
                      <div className="flex items-center gap-3">
                        <row.icon className="h-4 w-4 text-primary" />
                        <span className="text-sm text-muted-foreground">{row.label}</span>
                      </div>
                      <span className="text-sm font-medium text-foreground">{row.value}</span>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="section-pad relative">
        <div className="container-max">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl glass-panel p-10 text-center sm:p-16">
              <div className="pointer-events-none absolute -top-1/2 left-1/2 h-[80vh] w-[80vh] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
              <div className="relative">
                <Building2 className="mx-auto h-10 w-10 text-primary" />
                <h2 className="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl text-balance">
                  Let&apos;s build your regression policy together.
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
                  Book a 30-minute call with our team. We&apos;ll walk through your
                  contracts, your CI, and your security requirements.
                </p>
                <Magnetic>
                  <Link
                    href="/contact"
                    className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_40px_-6px_hsl(174_72%_51%/0.6)]"
                  >
                    Book a call
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Magnetic>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
