'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import {
  Activity,
  GitBranch,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { CommandPalette } from '@/components/dashboard/command-palette';
import { NotificationCenter } from '@/components/dashboard/notification-center';
import { ProjectsGrid } from '@/components/dashboard/projects-grid';
import { ReportsTable } from '@/components/dashboard/reports-table';
import { ApiExplorerView } from '@/components/dashboard/api-explorer-view';
import { IntegrationsView } from '@/components/dashboard/integrations-view';
import { SettingsView } from '@/components/dashboard/settings-view';
import { TrafficReplayVisualizer } from '@/components/technology/traffic-replay-visualizer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Reveal, StaggerGroup, staggerItem } from '@/components/site/primitives';
import { cn } from '@/lib/utils';

const driftData = [
  { day: 'Mon', breaking: 2, compatible: 8, cosmetic: 14 },
  { day: 'Tue', breaking: 0, compatible: 5, cosmetic: 11 },
  { day: 'Wed', breaking: 1, compatible: 7, cosmetic: 9 },
  { day: 'Thu', breaking: 3, compatible: 10, cosmetic: 16 },
  { day: 'Fri', breaking: 0, compatible: 4, cosmetic: 8 },
  { day: 'Sat', breaking: 0, compatible: 2, cosmetic: 3 },
  { day: 'Sun', breaking: 0, compatible: 1, cosmetic: 2 },
];

const latencyData = [
  { run: '1', ms: 680 },
  { run: '2', ms: 742 },
  { run: '3', ms: 611 },
  { run: '4', ms: 789 },
  { run: '5', ms: 703 },
  { run: '6', ms: 658 },
  { run: '7', ms: 724 },
  { run: '8', ms: 691 },
  { run: '9', ms: 756 },
  { run: '10', ms: 672 },
];

const recentRuns = [
  { repo: 'orders-api', pr: '#842', status: 'blocked', changes: 3, breaking: 1, time: '2m ago' },
  { repo: 'payments-svc', pr: '#119', status: 'passed', changes: 5, breaking: 0, time: '14m ago' },
  { repo: 'billing-svc', pr: '#67', status: 'passed', changes: 2, breaking: 0, time: '38m ago' },
  { repo: 'analytics-svc', pr: '#204', status: 'blocked', changes: 4, breaking: 2, time: '1h ago' },
  { repo: 'user-svc', pr: '#88', status: 'passed', changes: 1, breaking: 0, time: '2h ago' },
  { repo: 'auth-svc', pr: '#45', status: 'passed', changes: 3, breaking: 0, time: '3h ago' },
];

const kpis = [
  { icon: GitBranch, label: 'Active contracts', value: '47', trend: '+3', color: 'text-primary' },
  { icon: ShieldCheck, label: 'Blocked merges (7d)', value: '6', trend: '-2', color: 'text-chart-3' },
  { icon: Activity, label: 'Avg diff latency', value: '702ms', trend: '-48ms', color: 'text-chart-2' },
  { icon: AlertTriangle, label: 'Live drift alerts', value: '2', trend: '+1', color: 'text-destructive' },
];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Top Header */}
      <DashboardHeader
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      <div className="flex flex-1">
        {/* Collapsible Sidebar */}
        <DashboardSidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        {/* Main Dashboard Workspace Content */}
        <main className="flex-1 p-6 md:p-8 space-y-8 overflow-y-auto max-w-7xl">
          {/* Executive Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
                    Executive Dashboard <span className="gradient-text">Overview</span>
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Real-time compatibility telemetry across 8 microservices
                  </p>
                </div>
                <Badge variant="outline" className="font-mono text-xs border-primary/40 text-primary w-fit">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary mr-2 animate-pulse-glow" />
                  ALL PROBES ONLINE
                </Badge>
              </div>

              {/* KPI cards */}
              <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {kpis.map((k) => (
                  <motion.div key={k.label} variants={staggerItem}>
                    <div className="glass-panel rounded-2xl p-5">
                      <div className="flex items-center justify-between">
                        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/40', k.color)}>
                          <k.icon className="h-5 w-5" />
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono">
                          <TrendingUp className="h-3 w-3" />
                          {k.trend}
                        </span>
                      </div>
                      <p className="mt-4 font-display text-3xl font-semibold tracking-tight">
                        {k.value}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{k.label}</p>
                    </div>
                  </motion.div>
                ))}
              </StaggerGroup>

              {/* Charts */}
              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <Reveal>
                  <div className="glass-panel rounded-2xl p-6">
                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display text-lg font-semibold">Change classification</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">Last 7 days · all contracts</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Breaking
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2.5 w-2.5 rounded-full bg-chart-3" /> Compatible
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Cosmetic
                        </span>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={driftData}>
                        <defs>
                          <linearGradient id="g-breaking" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(0 84% 62%)" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="hsl(0 84% 62%)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="g-compat" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(43 90% 62%)" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(43 90% 62%)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="g-cosmetic" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(174 72% 51%)" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(174 72% 51%)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(212 18% 16%)" vertical={false} />
                        <XAxis dataKey="day" stroke="hsl(205 14% 50%)" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="hsl(205 14% 50%)" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{
                            background: 'hsl(212 22% 7%)',
                            border: '1px solid hsl(212 18% 16%)',
                            borderRadius: '12px',
                            fontSize: '12px',
                          }}
                          labelStyle={{ color: 'hsl(200 30% 98%)' }}
                        />
                        <Area type="monotone" dataKey="cosmetic" stackId="1" stroke="hsl(174 72% 51%)" strokeWidth={2} fill="url(#g-cosmetic)" />
                        <Area type="monotone" dataKey="compatible" stackId="1" stroke="hsl(43 90% 62%)" strokeWidth={2} fill="url(#g-compat)" />
                        <Area type="monotone" dataKey="breaking" stackId="1" stroke="hsl(0 84% 62%)" strokeWidth={2} fill="url(#g-breaking)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Reveal>

                <Reveal delay={0.1}>
                  <div className="glass-panel rounded-2xl p-6">
                    <div className="mb-6">
                      <h3 className="font-display text-lg font-semibold">Diff latency</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">Last 10 pipeline runs</p>
                    </div>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={latencyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(212 18% 16%)" vertical={false} />
                        <XAxis dataKey="run" stroke="hsl(205 14% 50%)" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="hsl(205 14% 50%)" fontSize={11} tickLine={false} axisLine={false} unit="ms" />
                        <Tooltip
                          contentStyle={{
                            background: 'hsl(212 22% 7%)',
                            border: '1px solid hsl(212 18% 16%)',
                            borderRadius: '12px',
                            fontSize: '12px',
                          }}
                          cursor={{ fill: 'hsl(174 72% 51% / 0.05)' }}
                        />
                        <Bar dataKey="ms" radius={[6, 6, 0, 0]}>
                          {latencyData.map((entry, i) => (
                            <Cell key={i} fill={entry.ms > 750 ? 'hsl(43 90% 62%)' : 'hsl(174 72% 51%)'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Reveal>
              </div>

              {/* Monitored API Microservices Projects Grid */}
              <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold">Monitored API Microservices</h3>
                  <Button size="sm" variant="ghost" onClick={() => setActiveTab('projects')} className="text-xs text-primary">
                    View All Projects <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
                <ProjectsGrid />
              </div>

              {/* Recent pipeline runs */}
              <Reveal className="pt-4">
                <div className="glass-panel overflow-hidden rounded-2xl">
                  <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                    <h3 className="font-display text-lg font-semibold">Recent pipeline runs</h3>
                    <button
                      onClick={() => setActiveTab('reports')}
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      View all reports <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="divide-y divide-border/40">
                    {recentRuns.map((run) => (
                      <div key={run.repo + run.pr} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-secondary/20">
                        <div className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-xl',
                          run.status === 'blocked' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                        )}>
                          {run.status === 'blocked' ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium text-foreground">{run.repo}</span>
                            <span className="font-mono text-xs text-muted-foreground">{run.pr}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {run.changes} changes · {run.breaking} breaking
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'rounded-full px-2.5 py-0.5 text-xs font-medium',
                            run.status === 'blocked' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                          )}>
                            {run.status}
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {run.time}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          )}

          {/* Sub-Views */}
          {activeTab === 'projects' && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-semibold">Monitored API Projects</h1>
              <ProjectsGrid />
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-semibold">API Compatibility Reports</h1>
              <ReportsTable />
            </div>
          )}

          {activeTab === 'explorer' && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-semibold">API Endpoints & Schema Explorer</h1>
              <ApiExplorerView />
            </div>
          )}

          {activeTab === 'replay' && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-semibold">Shadow Traffic Replay Telemetry</h1>
              <TrafficReplayVisualizer />
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-semibold">CI/CD Pipeline Integrations</h1>
              <IntegrationsView />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-semibold">Organization & API Key Settings</h1>
              <SettingsView />
            </div>
          )}

          {/* Final Transition CTA */}
          <div className="mt-16 pt-8 border-t border-border/60 rounded-3xl glass-panel p-8 text-center space-y-4">
            <h3 className="font-display text-xl font-semibold">Want to integrate DRIFT into your workflow?</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Explore CLI usage, GitHub Actions workflows, and WASM AST diffing documentation.
            </p>
            <div className="flex justify-center gap-4 pt-2">
              <Button size="sm" asChild variant="default" className="h-10 px-6">
                <Link href="/docs">
                  <BookOpen className="mr-2 h-4 w-4" />
                  <span>View Documentation</span>
                </Link>
              </Button>
              <Button size="sm" variant="glass" onClick={() => setActiveTab('integrations')} className="h-10 px-6 border-border">
                <GitBranch className="mr-2 h-4 w-4" />
                <span>Configure Integrations</span>
              </Button>
            </div>
          </div>
        </main>
      </div>

      {/* Command Palette Modal */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectAction={(tab) => setActiveTab(tab)}
      />

      {/* Notification Drawer */}
      <NotificationCenter
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />
    </div>
  );
}
