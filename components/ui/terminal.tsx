"use client";

import React from "react";
import { Terminal as TerminalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TerminalLine {
  type?: "input" | "output" | "error" | "success" | "info";
  content: string;
}

interface TerminalProps {
  lines?: TerminalLine[];
  title?: string;
  className?: string;
}

export function Terminal({
  lines = [
    { type: "input", content: "drift diff --baseline=v1.2.0.json --target=v1.3.0.json" },
    { type: "info", content: "[1/6] Ingesting & normalizing OpenAPI AST trees..." },
    { type: "info", content: "[2/6] Computing semantic schema delta matrix..." },
    { type: "error", content: "CRITICAL: Deleted field `user_id` in /v2/orders payload (Breaking Consumer V1)" },
    { type: "success", content: "Pipeline complete: 1 Breaking Change detected in 142ms." },
  ],
  title = "DRIFT Sentinel CLI v1.4.2",
  className,
}: TerminalProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-slate-800 bg-[#04060A] font-mono text-xs shadow-2xl", className)}>
      <div className="flex items-center justify-between border-b border-slate-800 bg-[#0A0E17] px-4 py-2.5">
        <div className="flex items-center space-x-2">
          <TerminalIcon className="h-3.5 w-3.5 text-drift-cyan" />
          <span className="text-xs text-slate-300 font-medium">{title}</span>
        </div>
        <div className="flex space-x-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-slate-700" />
          <div className="h-2.5 w-2.5 rounded-full bg-slate-700" />
        </div>
      </div>
      <div className="space-y-2 p-4 text-slate-300 min-h-[160px] leading-relaxed">
        {lines.map((line, idx) => (
          <div key={idx} className="flex items-start space-x-2">
            {line.type === "input" ? (
              <span className="text-drift-cyan font-bold">$</span>
            ) : (
              <span className="text-slate-600">›</span>
            )}
            <span
              className={cn(
                line.type === "error" && "text-rose-400 font-semibold",
                line.type === "success" && "text-emerald-400 font-semibold",
                line.type === "info" && "text-slate-400",
                line.type === "input" && "text-slate-100 font-semibold"
              )}
            >
              {line.content}
            </span>
          </div>
        ))}
        <div className="flex items-center space-x-2 pt-1">
          <span className="text-drift-cyan font-bold">$</span>
          <span className="h-4 w-2 animate-pulse bg-drift-cyan" />
        </div>
      </div>
    </div>
  );
}
