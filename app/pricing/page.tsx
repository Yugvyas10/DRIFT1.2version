'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Check,
  X,
  Sparkles,
  Building2,
  Rocket,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';
import { Reveal, SectionHeading, StaggerGroup, staggerItem } from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';
import { cn } from '@/lib/utils';

const plans = [
  {
    name: 'Hobby',
    icon: Sparkles,
    desc: 'For solo developers and side projects.',
    monthly: 0,
    yearly: 0,
    cta: 'Start free',
    href: '/register',
    features: [
      '1 contract',
      'Unlimited diff checks',
      'GitHub Actions integration',
      'Community support',
    ],
    highlight: false,
  },
  {
    name: 'Pro',
    icon: Rocket,
    desc: 'For growing teams shipping APIs daily.',
    monthly: 49,
    yearly: 39,
    cta: 'Start 14-day trial',
    href: '/register',
    features: [
      'Up to 25 contracts',
      'Consumer dependency graph',
      'Live drift monitoring',
      'Slack & email alerts',
      'Priority support',
      'Custom rules',
    ],
    highlight: true,
  },
  {
    name: 'Enterprise',
    icon: Building2,
    desc: 'For organizations with advanced needs.',
    monthly: null,
    yearly: null,
    cta: 'Contact sales',
    href: '/enterprise',
    features: [
      'Unlimited contracts',
      'Self-hosted or air-gapped',
      'SSO / SAML & SCIM',
      'Audit logs & RBAC',
      'Dedicated support engineer',
      'Custom SLAs',
    ],
    highlight: false,
  },
];

const comparison = [
  { feature: 'Contracts', hobby: '1', pro: '25', enterprise: 'Unlimited' },
  { feature: 'Diff checks / month', hobby: 'Unlimited', pro: 'Unlimited', enterprise: 'Unlimited' },
  { feature: 'CI integrations', hobby: 'GitHub', pro: 'All', enterprise: 'All + custom' },
  { feature: 'Consumer graph', hobby: false, pro: true, enterprise: true },
  { feature: 'Live drift monitoring', hobby: false, pro: true, enterprise: true },
  { feature: 'Custom rules', hobby: false, pro: true, enterprise: true },
  { feature: 'SSO / SAML', hobby: false, pro: false, enterprise: true },
  { feature: 'Audit logs', hobby: false, pro: false, enterprise: true },
  { feature: 'Self-hosted', hobby: false, pro: false, enterprise: true },
  { feature: 'Support', hobby: 'Community', pro: 'Priority', enterprise: 'Dedicated' },
];

const faqs = [
  {
    q: 'What counts as a contract?',
    a: 'A contract is a single OpenAPI, gRPC, GraphQL, or AsyncAPI specification file. You can version it freely — new versions of the same contract don\'t count against your limit.',
  },
  {
    q: 'Can I switch plans anytime?',
    a: 'Yes. Upgrades take effect immediately. Downgrades take effect at the end of your current billing cycle. No lock-in, no penalties.',
  },
  {
    q: 'Do you offer a free trial?',
    a: 'Every paid plan includes a 14-day free trial with full access to all features. No credit card required to start.',
  },
  {
    q: 'Is my contract data secure?',
    a: 'All contract data is encrypted in transit and at rest. On Enterprise, you can self-host or deploy air-gapped so data never leaves your network.',
  },
];

export default function PricingPage() {
  const [yearly, setYearly] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title={
          <>
            Pricing that <span className="gradient-text">scales with you.</span>
          </>
        }
        description="Start free, upgrade when you need consumer graphs and live monitoring, or go Enterprise for self-hosted and SSO. No surprises."
      >
        {/* Billing toggle */}
        <div className="relative inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 p-1">
          {[
            { key: 'monthly', label: 'Monthly', active: !yearly, set: () => setYearly(false) },
            {
              key: 'yearly',
              label: (
                <>
                  Yearly <span className="ml-1.5 text-xs opacity-80">-20%</span>
                </>
              ),
              active: yearly,
              set: () => setYearly(true),
            },
          ].map((mode) => (
            <button
              key={mode.key}
              onClick={mode.set}
              className={cn(
                'relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                mode.active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {mode.active && (
                <motion.span
                  layoutId="billing-pill"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative z-10">{mode.label}</span>
            </button>
          ))}
        </div>
      </PageHero>

      {/* Plans */}
      <section className="section-pad relative">
        <div className="container-max">
          <StaggerGroup stagger={0.12} delayChildren={0.05} className="grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <motion.div key={plan.name} variants={staggerItem} className="h-full">
                <div
                  className={cn(
                    'relative flex h-full flex-col rounded-2xl p-8 transition-all duration-300',
                    plan.highlight
                      ? 'glass-strong border-primary/40 glow-md hover:-translate-y-1'
                      : 'glass-panel hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_16px_50px_-16px_hsl(174_72%_51%/0.12)]'
                  )}
                >
                  {plan.highlight && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.4, type: 'spring', stiffness: 300, damping: 20 }}
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                    >
                      Most popular
                    </motion.span>
                  )}
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-xl',
                      plan.highlight ? 'bg-primary/15 text-primary' : 'bg-secondary/40 text-muted-foreground'
                    )}>
                      <plan.icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{plan.desc}</p>

                  <div className="mt-6 flex items-end gap-1">
                    {plan.monthly === null ? (
                      <span className="font-display text-4xl font-semibold">Custom</span>
                    ) : (
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={yearly ? 'yearly' : 'monthly'}
                          initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
                          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                          exit={{ opacity: 0, y: -14, filter: 'blur(4px)' }}
                          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                          className="font-display text-5xl font-semibold tracking-tight"
                        >
                          ${yearly ? plan.yearly : plan.monthly}
                        </motion.span>
                      </AnimatePresence>
                    )}
                    {plan.monthly !== null && (
                      <span className="mb-1.5 text-sm text-muted-foreground">/mo</span>
                    )}
                  </div>
                  {plan.monthly !== null && plan.monthly > 0 && yearly && (
                    <p className="mt-1 text-xs text-primary">Billed annually</p>
                  )}

                  <Link
                    href={plan.href}
                    className={cn(
                      'group mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all',
                      plan.highlight
                        ? 'bg-primary text-primary-foreground hover:shadow-[0_0_40px_-6px_hsl(174_72%_51%/0.6)]'
                        : 'border border-border bg-secondary/40 text-foreground hover:border-primary/40'
                    )}
                  >
                    {plan.cta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>

                  <div className="my-6 hairline" />

                  <ul className="flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* Comparison table */}
      <section className="section-pad relative">
        <div className="container-max">
          <SectionHeading
            eyebrow="Compare plans"
            title={
              <>
                Every feature, <span className="gradient-text">side by side.</span>
              </>
            }
          />
          <Reveal className="mt-12">
            <div className="overflow-hidden rounded-2xl glass-panel">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Feature</th>
                      <th className="px-6 py-4 text-center text-sm font-semibold text-muted-foreground">Hobby</th>
                      <th className="px-6 py-4 text-center text-sm font-semibold text-primary">Pro</th>
                      <th className="px-6 py-4 text-center text-sm font-semibold text-muted-foreground">Enterprise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((row, i) => (
                      <motion.tr
                        key={row.feature}
                        initial={{ opacity: 0, x: -16 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: '-40px' }}
                        transition={{ duration: 0.55, delay: i * 0.045, ease: [0.22, 1, 0.36, 1] }}
                        className={cn(
                          'border-b border-border/30 transition-colors hover:bg-primary/5',
                          i % 2 === 1 && 'bg-secondary/10'
                        )}
                      >
                        <td className="px-6 py-3.5 text-sm text-muted-foreground">{row.feature}</td>
                        {[row.hobby, row.pro, row.enterprise].map((val, j) => (
                          <td key={j} className="px-6 py-3.5 text-center">
                            {typeof val === 'boolean' ? (
                              val ? (
                                <Check className="mx-auto h-4 w-4 text-primary" />
                              ) : (
                                <X className="mx-auto h-4 w-4 text-muted-foreground/40" />
                              )
                            ) : (
                              <span className={cn(
                                'text-sm',
                                j === 1 ? 'font-medium text-primary' : 'text-muted-foreground'
                              )}>
                                {val}
                              </span>
                            )}
                          </td>
                        ))}
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-pad relative">
        <div className="container-max">
          <SectionHeading
            eyebrow="FAQ"
            title={
              <>
                Questions, <span className="gradient-text">answered.</span>
              </>
            }
          />
          <div className="mx-auto mt-12 max-w-2xl space-y-3">
            {faqs.map((faq, i) => (
              <Reveal key={faq.q} delay={i * 0.06}>
                <div className="overflow-hidden rounded-xl glass-panel">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left"
                  >
                    <span className="text-sm font-medium text-foreground">{faq.q}</span>
                    <HelpCircle className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      openFaq === i && 'rotate-180 text-primary'
                    )} />
                  </button>
                  <AnimatePresence>
                    {openFaq === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">
                          {faq.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
