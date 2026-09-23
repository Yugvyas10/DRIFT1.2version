'use client';

import React from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  FolderGit2,
  FileText,
  FileCode,
  Activity,
  GitBranch,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/site/logo';

export interface DashboardNavTab {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

export const dashboardNavTabs: DashboardNavTab[] = [
  { id: 'overview', label: 'Executive Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'projects', label: 'API Projects', icon: <FolderGit2 className="h-4 w-4" />, badge: '8' },
  { id: 'reports', label: 'Compatibility Reports', icon: <FileText className="h-4 w-4" /> },
  { id: 'explorer', label: 'API Explorer', icon: <FileCode className="h-4 w-4" /> },
  { id: 'replay', label: 'Replay Telemetry', icon: <Activity className="h-4 w-4" /> },
  { id: 'integrations', label: 'CI/CD Integrations', icon: <GitBranch className="h-4 w-4" /> },
  { id: 'settings', label: 'Org Settings', icon: <Settings className="h-4 w-4" /> },
];

interface DashboardSidebarProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export function DashboardSidebar({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  className,
}: DashboardSidebarProps) {
  return (
    <aside
      className={cn(
        'relative flex flex-col justify-between border-r border-border/60 bg-background-2/50 p-4 transition-all duration-300 z-30 shrink-0 min-h-[88vh]',
        isCollapsed ? 'w-20' : 'w-64',
        className
      )}
    >
      <div className="space-y-6">
        {/* Workspace Brand Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <Link href="/" className="flex items-center space-x-2.5">
            <Logo className="h-7 w-7" />
            {!isCollapsed && (
              <span className="font-display text-base font-semibold tracking-tight text-foreground">
                DRIFT<span className="text-primary text-xs font-normal ml-1">Console</span>
              </span>
            )}
          </Link>
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation Tabs */}
        <nav className="space-y-1">
          {dashboardNavTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={cn(
                  'flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left',
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_20px_-4px_hsl(174_72%_51%/0.3)]'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                )}
                title={isCollapsed ? tab.label : undefined}
              >
                <div className="flex items-center space-x-3 truncate">
                  <div className={cn(isActive && 'text-primary')}>{tab.icon}</div>
                  {!isCollapsed && <span className="truncate">{tab.label}</span>}
                </div>
                {!isCollapsed && tab.badge && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer System Status */}
      {!isCollapsed && (
        <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 text-xs text-primary font-mono">
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
            <span className="font-semibold">Probes Online</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">16/16 eBPF cluster nodes</p>
        </div>
      )}
    </aside>
  );
}
