import React from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  number: string;
  label: string;
  description?: string;
  className?: string;
}

export function StatCard({ number, label, description, className }: StatCardProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-slate-800/80 bg-[#0A0E17] p-6 text-center shadow-lg", className)}>
      <div className="text-3xl lg:text-4xl font-extrabold font-mono text-transparent bg-clip-text bg-gradient-to-r from-drift-cyan via-white to-drift-purple">
        {number}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-200">{label}</div>
      {description && <p className="mt-1 text-xs text-slate-400">{description}</p>}
    </div>
  );
}
