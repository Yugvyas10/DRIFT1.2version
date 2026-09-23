"use client";

import React from "react";
import { AlertTriangle, Info, CheckCircle2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocsCalloutProps {
  type?: "info" | "warning" | "important" | "tip";
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function DocsCallout({ type = "info", title, children, className }: DocsCalloutProps) {
  const isTip = type === "tip";
  const isWarning = type === "warning";
  const isImportant = type === "important";

  return (
    <div
      className={cn(
        "p-4 rounded-xl border font-sans text-xs space-y-1.5 my-4",
        isTip && "border-emerald-500/30 bg-emerald-950/10 text-emerald-300",
        isWarning && "border-amber-500/30 bg-amber-950/10 text-amber-300",
        isImportant && "border-rose-500/40 bg-rose-950/20 text-rose-300",
        type === "info" && "border-drift-cyan/30 bg-drift-cyan/10 text-slate-300",
        className
      )}
    >
      <div className="flex items-center space-x-2 font-bold font-mono text-[11px] uppercase tracking-wider">
        {isTip && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
        {isWarning && <AlertTriangle className="h-4 w-4 text-amber-400" />}
        {isImportant && <ShieldAlert className="h-4 w-4 text-rose-400" />}
        {type === "info" && <Info className="h-4 w-4 text-drift-cyan" />}
        <span>{title || type.toUpperCase()}</span>
      </div>
      <div className="text-slate-300 leading-relaxed font-sans">{children}</div>
    </div>
  );
}
