'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Mail,
  MessageSquare,
  Building2,
  MapPin,
  ArrowRight,
  Check,
  Phone,
} from 'lucide-react';
import { Reveal, StaggerGroup, staggerItem, Magnetic } from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';

const contactMethods = [
  { icon: Mail, label: 'Email', value: 'hello@drift.dev', href: 'mailto:hello@drift.dev' },
  { icon: MessageSquare, label: 'Live chat', value: 'Available 9am–6pm PT', href: '#' },
  { icon: Phone, label: 'Sales', value: '+1 (415) 555-0142', href: 'tel:+14155550142' },
];

const offices = [
  { city: 'San Francisco', address: '548 Market St, Suite 40200', country: 'United States' },
  { city: 'London', address: '1 Finsbury Avenue', country: 'United Kingdom' },
  { city: 'Singapore', address: '8 Marina View, #43-02', country: 'Singapore' },
];

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    teamSize: '',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={
          <>
            Let&apos;s <span className="gradient-text">talk.</span>
          </>
        }
        description="Whether you're evaluating DRIFT for your team or need help with an integration, we'd love to hear from you."
      />

      <section className="section-pad relative">
        <div className="container-max">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr]">
            {/* Contact info */}
            <div className="flex h-full flex-col gap-6">
              <Reveal variant="left">
                <div className="glass-panel rounded-2xl p-6">
                  <h3 className="font-display text-lg font-semibold">Get in touch</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    Our team typically responds within a few hours during business days.
                  </p>
                  <div className="mt-6 space-y-4">
                    {contactMethods.map((m) => (
                      <a
                        key={m.label}
                        href={m.href}
                        className="group flex items-center gap-4 rounded-xl border border-border bg-secondary/20 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_10px_30px_-12px_hsl(174_72%_51%/0.25)]"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
                          <m.icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground">{m.label}</p>
                          <p className="text-sm font-medium text-foreground">{m.value}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                      </a>
                    ))}
                  </div>
                </div>
              </Reveal>

              <Reveal variant="left" delay={0.08}>
                <div className="glass-panel rounded-2xl p-6">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <h3 className="font-display text-lg font-semibold">Offices</h3>
                  </div>
                  <div className="mt-5 space-y-4">
                    {offices.map((o) => (
                      <div key={o.city} className="flex items-start gap-3">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{o.city}, {o.country}</p>
                          <p className="text-xs text-muted-foreground">{o.address}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>

            {/* Form */}
            <Reveal variant="right" delay={0.05}>
              <div className="glass-panel rounded-2xl p-8">
                {submitted ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                    transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                    className="flex h-full flex-col items-center justify-center py-20 text-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.15 }}
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/30"
                    >
                      <Check className="h-8 w-8" />
                    </motion.div>
                    <h3 className="mt-6 font-display text-2xl font-semibold">Message sent</h3>
                    <p className="mt-3 max-w-sm text-sm text-muted-foreground leading-relaxed">
                      Thanks for reaching out. Our team will get back to you within a few hours.
                    </p>
                    <button
                      onClick={() => setSubmitted(false)}
                      className="mt-6 inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-5 py-2.5 text-sm font-medium text-foreground transition-all hover:border-primary/40"
                    >
                      Send another message
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <StaggerGroup stagger={0.06} delayChildren={0}>
                      <div className="grid gap-5 sm:grid-cols-2">
                        <motion.div variants={staggerItem}>
                          <label className="mb-2 block text-sm font-medium text-foreground">
                            Name
                          </label>
                          <input
                            required
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="Jane Doe"
                            className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </motion.div>
                        <motion.div variants={staggerItem}>
                          <label className="mb-2 block text-sm font-medium text-foreground">
                            Work email
                          </label>
                          <input
                            required
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            placeholder="jane@company.com"
                            className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </motion.div>
                      </div>
                      <div className="grid gap-5 sm:grid-cols-2">
                        <motion.div variants={staggerItem}>
                          <label className="mb-2 block text-sm font-medium text-foreground">
                            Company
                          </label>
                          <input
                            type="text"
                            value={form.company}
                            onChange={(e) => setForm({ ...form, company: e.target.value })}
                            placeholder="Acme Inc."
                            className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </motion.div>
                        <motion.div variants={staggerItem}>
                          <label className="mb-2 block text-sm font-medium text-foreground">
                            Team size
                          </label>
                          <select
                            value={form.teamSize}
                            onChange={(e) => setForm({ ...form, teamSize: e.target.value })}
                            className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground transition-all duration-300 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          >
                            <option value="">Select...</option>
                            <option>1–10</option>
                            <option>11–50</option>
                            <option>51–200</option>
                            <option>200+</option>
                          </select>
                        </motion.div>
                      </div>
                      <motion.div variants={staggerItem}>
                        <label className="mb-2 block text-sm font-medium text-foreground">
                          How can we help?
                        </label>
                        <textarea
                          required
                          rows={5}
                          value={form.message}
                          onChange={(e) => setForm({ ...form, message: e.target.value })}
                          placeholder="Tell us about your API surface and what you're looking to solve..."
                          className="w-full resize-none rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </motion.div>
                      <motion.div variants={staggerItem}>
                        <Magnetic className="block">
                          <button
                            type="submit"
                            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground transition-all duration-300 hover:shadow-[0_0_40px_-6px_hsl(174_72%_51%/0.6)] active:scale-[0.98]"
                          >
                            Send message
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                          </button>
                        </Magnetic>
                      </motion.div>
                    </StaggerGroup>
                    <p className="text-center text-xs text-muted-foreground">
                      By submitting, you agree to our privacy policy. We&apos;ll never share your data.
                    </p>
                  </form>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
