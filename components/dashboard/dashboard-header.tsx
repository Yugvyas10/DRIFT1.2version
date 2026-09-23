'use client';

import React from 'react';
import { SearchTrigger } from '@/components/ui/search';
import { Badge } from '@/components/ui/badge';
import { Building2, ChevronDown, Bell } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface DashboardHeaderProps {
  onOpenNotifications: () => void;
  onOpenCommandPalette: () => void;
  unreadCount?: number;
}

export function DashboardHeader({
  onOpenNotifications,
  onOpenCommandPalette,
  unreadCount = 3,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-6 py-3.5 backdrop-blur-xl sticky top-0 z-40">
      {/* Organization & Project Switcher */}
      <div className="flex items-center space-x-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center space-x-2 rounded-xl border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 transition-colors">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="font-semibold">Acme Corp Enterprise</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem>Acme Corp Enterprise</DropdownMenuItem>
            <DropdownMenuItem>Staging Sandbox Org</DropdownMenuItem>
            <DropdownMenuItem className="text-primary">+ Create Organization</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-muted-foreground">/</span>

        <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
          Payment Checkout Services
        </Badge>
      </div>

      {/* Right Controls: Command Palette Search, Notifications, Profile */}
      <div className="flex items-center space-x-3">
        <button onClick={onOpenCommandPalette}>
          <SearchTrigger />
        </button>

        {/* Notification Bell */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2 rounded-xl border border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          title="Notification Center"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive font-mono text-[9px] font-bold text-destructive-foreground">
              {unreadCount}
            </span>
          )}
        </button>

        {/* User Profile Avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center space-x-2 p-1 rounded-full border border-border bg-secondary/40 hover:border-primary/40 transition-colors">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-xs">
              AT
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="font-bold text-foreground">Tyrell (Lead Architect)</DropdownMenuItem>
            <DropdownMenuItem>Account Settings</DropdownMenuItem>
            <DropdownMenuItem>API Keys</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">Sign Out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
