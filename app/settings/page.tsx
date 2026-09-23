'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  KeyRound,
  Bell,
  CreditCard,
  Building2,
  Trash2,
  Check,
  ChevronRight,
  Github,
  Shield,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Reveal } from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'team', label: 'Team', icon: Building2 },
  { id: 'danger', label: 'Danger zone', icon: Trash2 },
];

export default function SettingsPage() {
  const [active, setActive] = useState('profile');
  const [showKey, setShowKey] = useState(false);
  const [notif, setNotif] = useState({ breaking: true, compatible: true, drift: true, weekly: false });

  return (
    <>
      <PageHero
        eyebrow="Settings"
        title={
          <>
            Manage your <span className="gradient-text">account.</span>
          </>
        }
        description="Update your profile, security, notifications, billing, and team preferences."
      />

      <section className="section-pad relative">
        <div className="container-max">
          <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
            {/* Sidebar */}
            <Reveal>
              <aside className="sticky top-24 self-start">
                <nav className="space-y-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActive(tab.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all',
                        active === tab.id
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
                      )}
                    >
                      <tab.icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </aside>
            </Reveal>

            {/* Content */}
            <Reveal delay={0.1}>
              <div className="glass-panel rounded-2xl p-8">
                <AnimatePresence mode="wait">
                  {active === 'profile' && (
                    <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                      <h2 className="font-display text-xl font-semibold">Profile</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Update your personal information.</p>
                      <div className="mt-6 flex items-center gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-chart-2/20 text-xl font-semibold text-primary ring-1 ring-primary/20">
                          J
                        </div>
                        <button className="rounded-xl border border-border bg-secondary/40 px-4 py-2 text-sm font-medium text-foreground transition-all hover:border-primary/40">
                          Change avatar
                        </button>
                      </div>
                      <div className="mt-6 grid gap-5 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-medium">Full name</label>
                          <input defaultValue="Jane Doe" className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium">Email</label>
                          <input defaultValue="jane@company.com" className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium">Role</label>
                          <input defaultValue="Staff Engineer" className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium">Timezone</label>
                          <select className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20">
                            <option>America/Los_Angeles</option>
                            <option>America/New_York</option>
                            <option>Europe/London</option>
                            <option>Asia/Singapore</option>
                          </select>
                        </div>
                      </div>
                      <div className="mt-6 flex justify-end">
                        <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_24px_-4px_hsl(174_72%_51%/0.5)]">
                          <Check className="h-4 w-4" /> Save changes
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {active === 'security' && (
                    <motion.div key="security" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                      <h2 className="font-display text-xl font-semibold">Security</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Manage your credentials and API access.</p>
                      <div className="mt-6 space-y-4">
                        <div className="rounded-xl border border-border bg-secondary/20 p-5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <KeyRound className="h-5 w-5 text-primary" />
                              <div>
                                <p className="text-sm font-medium">API key</p>
                                <p className="text-xs text-muted-foreground">Used to authenticate CLI and CI runs</p>
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 flex items-center gap-2">
                            <code className="flex-1 rounded-lg border border-border bg-background/60 px-3 py-2.5 font-mono text-xs text-muted-foreground">
                              {showKey ? 'drft_live_8429aef3b1c7d290' : 'drft_live_••••••••••••••••'}
                            </code>
                            <button onClick={() => setShowKey((v) => !v)} className="rounded-lg border border-border bg-secondary/40 p-2.5 text-muted-foreground hover:text-foreground">
                              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                            <button className="rounded-lg border border-border bg-secondary/40 p-2.5 text-muted-foreground hover:text-foreground">
                              <Github className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="rounded-xl border border-border bg-secondary/20 p-5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Shield className="h-5 w-5 text-primary" />
                              <div>
                                <p className="text-sm font-medium">Two-factor authentication</p>
                                <p className="text-xs text-muted-foreground">Add an extra layer of security</p>
                              </div>
                            </div>
                            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">Enabled</span>
                          </div>
                        </div>
                        <div className="rounded-xl border border-border bg-secondary/20 p-5">
                          <p className="text-sm font-medium">Active sessions</p>
                          <div className="mt-3 space-y-2">
                            {[
                              { device: 'MacBook Pro · Chrome', location: 'San Francisco, US', current: true },
                              { device: 'iPhone 15 · Safari', location: 'San Francisco, US', current: false },
                            ].map((s) => (
                              <div key={s.device} className="flex items-center justify-between rounded-lg bg-background/40 px-3 py-2.5">
                                <div>
                                  <p className="text-xs font-medium text-foreground">{s.device}</p>
                                  <p className="text-xs text-muted-foreground">{s.location}</p>
                                </div>
                                {s.current ? (
                                  <span className="text-xs text-primary">Current</span>
                                ) : (
                                  <button className="text-xs text-destructive hover:underline">Revoke</button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {active === 'notifications' && (
                    <motion.div key="notifications" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                      <h2 className="font-display text-xl font-semibold">Notifications</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Choose what you want to hear about.</p>
                      <div className="mt-6 space-y-3">
                        {[
                          { key: 'breaking', label: 'Breaking changes', desc: 'When a PR introduces a breaking contract change' },
                          { key: 'compatible', label: 'Compatible changes', desc: 'When a PR introduces a compatible change' },
                          { key: 'drift', label: 'Live drift alerts', desc: 'When production traffic drifts from your contract' },
                          { key: 'weekly', label: 'Weekly summary', desc: 'A digest of contract health every Monday' },
                        ].map((n) => (
                          <div key={n.key} className="flex items-center justify-between rounded-xl border border-border bg-secondary/20 p-4">
                            <div>
                              <p className="text-sm font-medium text-foreground">{n.label}</p>
                              <p className="text-xs text-muted-foreground">{n.desc}</p>
                            </div>
                            <button
                              onClick={() => setNotif({ ...notif, [n.key]: !notif[n.key as keyof typeof notif] })}
                              className={cn(
                                'relative h-6 w-11 rounded-full transition-colors',
                                notif[n.key as keyof typeof notif] ? 'bg-primary' : 'bg-secondary'
                              )}
                            >
                              <span className={cn(
                                'absolute top-0.5 h-5 w-5 rounded-full bg-foreground transition-transform',
                                notif[n.key as keyof typeof notif] ? 'translate-x-5' : 'translate-x-0.5'
                              )} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {active === 'billing' && (
                    <motion.div key="billing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                      <h2 className="font-display text-xl font-semibold">Billing</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Manage your subscription and payment method.</p>
                      <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-primary">Pro plan</p>
                            <p className="text-xs text-muted-foreground">$39/mo · billed annually</p>
                          </div>
                          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">Active</span>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">Renews on Sep 1, 2026 · 25 contracts included</p>
                      </div>
                      <div className="mt-4 rounded-xl border border-border bg-secondary/20 p-5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <CreditCard className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">Visa ending in 4242</p>
                              <p className="text-xs text-muted-foreground">Expires 08/28</p>
                            </div>
                          </div>
                          <button className="text-sm text-primary hover:underline">Update</button>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <button className="text-sm text-muted-foreground hover:text-foreground">View invoices</button>
                        <button className="text-sm text-destructive hover:underline">Cancel subscription</button>
                      </div>
                    </motion.div>
                  )}

                  {active === 'team' && (
                    <motion.div key="team" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="font-display text-xl font-semibold">Team</h2>
                          <p className="mt-1 text-sm text-muted-foreground">Manage members and their roles.</p>
                        </div>
                        <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_24px_-4px_hsl(174_72%_51%/0.5)]">
                          Invite member
                        </button>
                      </div>
                      <div className="mt-6 space-y-2">
                        {[
                          { name: 'Jane Doe', email: 'jane@company.com', role: 'Owner', avatar: 'J' },
                          { name: 'Marcus Lee', email: 'marcus@company.com', role: 'Admin', avatar: 'M' },
                          { name: 'Sofia Reyes', email: 'sofia@company.com', role: 'Member', avatar: 'S' },
                          { name: 'James Park', email: 'james@company.com', role: 'Member', avatar: 'J' },
                        ].map((m) => (
                          <div key={m.email} className="flex items-center justify-between rounded-xl border border-border bg-secondary/20 p-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-chart-2/20 text-sm font-semibold text-primary ring-1 ring-primary/20">
                                {m.avatar}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{m.name}</p>
                                <p className="text-xs text-muted-foreground">{m.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-secondary/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{m.role}</span>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {active === 'danger' && (
                    <motion.div key="danger" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                      <h2 className="font-display text-xl font-semibold text-destructive">Danger zone</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Irreversible actions. Proceed with caution.</p>
                      <div className="mt-6 space-y-4">
                        <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-5">
                          <div>
                            <p className="text-sm font-medium text-foreground">Delete account</p>
                            <p className="text-xs text-muted-foreground">Permanently remove your account and all associated data.</p>
                          </div>
                          <button className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-all hover:bg-destructive/20">
                            Delete
                          </button>
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-5">
                          <div>
                            <p className="text-sm font-medium text-foreground">Export all data</p>
                            <p className="text-xs text-muted-foreground">Download a full archive of your contracts and analysis history.</p>
                          </div>
                          <button className="rounded-lg border border-border bg-secondary/40 px-4 py-2 text-sm font-medium text-foreground transition-all hover:border-primary/40">
                            Export
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
