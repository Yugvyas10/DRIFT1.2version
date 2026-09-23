import React from "react";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  badge?: string;
  title: string;
  description: string;
  breadcrumbItems?: BreadcrumbItem[];
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  badge,
  title,
  description,
  breadcrumbItems,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("relative pt-32 pb-12 border-b border-slate-800/80 bg-radial-gradient", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {breadcrumbItems && (
          <div className="mb-4">
            <Breadcrumb items={breadcrumbItems} />
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            {badge && <Badge variant="default" className="font-mono">{badge}</Badge>}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              {title}
            </h1>
            <p className="text-base md:text-lg text-slate-400 leading-relaxed">
              {description}
            </p>
          </div>
          {actions && <div className="flex items-center space-x-3 shrink-0">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
