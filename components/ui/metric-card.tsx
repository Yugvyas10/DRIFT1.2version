'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InteractiveCard } from '@/components/ui/spotlight-card';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({
  title,
  value,
  change,
  trend = 'neutral',
  subtitle,
  icon,
  className,
}: MetricCardProps) {
  return (
    <InteractiveCard className={cn('p-5 shadow-lg', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
        {icon && <div className="text-primary">{icon}</div>}
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <div className="text-2xl font-bold font-mono text-foreground tracking-tight">{value}</div>
        {change && (
          <div
            className={cn(
              'flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border',
              trend === 'up' && 'border-primary/30 bg-primary/10 text-primary',
              trend === 'down' && 'border-destructive/30 bg-destructive/10 text-destructive',
              trend === 'neutral' && 'border-border bg-secondary/60 text-muted-foreground'
            )}
          >
            {trend === 'up' && <TrendingUp className="mr-1 h-3 w-3" />}
            {trend === 'down' && <TrendingDown className="mr-1 h-3 w-3" />}
            {trend === 'neutral' && <Minus className="mr-1 h-3 w-3" />}
            {change}
          </div>
        )}
      </div>
      {subtitle && <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>}
    </InteractiveCard>
  );
}
