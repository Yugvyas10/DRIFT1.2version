import React from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center space-x-2 text-xs text-slate-400", className)}>
      <Link href="/" className="flex items-center hover:text-drift-cyan transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
          {item.href ? (
            <Link href={item.href} className="hover:text-drift-cyan transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-slate-200 font-medium">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
