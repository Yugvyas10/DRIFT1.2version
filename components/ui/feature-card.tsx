import React from "react";
import { cn } from "@/lib/utils";

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  tag?: string;
  className?: string;
}

export function FeatureCard({ icon, title, description, tag, className }: FeatureCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border border-slate-800 bg-[#0D131F]/80 p-6 transition-all duration-300 hover:border-drift-cyan/40 hover:bg-[#121824] hover:shadow-[0_10px_30px_rgba(0,240,255,0.1)]",
        className
      )}
    >
      <div>
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-800 bg-[#06080C] text-drift-cyan group-hover:border-drift-cyan/40 group-hover:bg-drift-cyan/10 transition-all">
            {icon}
          </div>
          {tag && (
            <span className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-0.5 font-mono text-[10px] uppercase text-slate-400">
              {tag}
            </span>
          )}
        </div>
        <h3 className="mt-5 text-lg font-semibold text-white group-hover:text-drift-cyan transition-colors">
          {title}
        </h3>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
