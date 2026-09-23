import React from "react";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES } from "@/constants/pipeline";

interface TimelineProps {
  activeStageIndex?: number;
  className?: string;
}

export function Timeline({ activeStageIndex = 0, className }: TimelineProps) {
  return (
    <div className={cn("w-full space-y-4", className)}>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        {PIPELINE_STAGES.map((stage, idx) => {
          const isActive = idx === activeStageIndex;
          const isCompleted = idx < activeStageIndex;

          return (
            <div
              key={stage.id}
              className={cn(
                "relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-300",
                isActive
                  ? "border-drift-cyan bg-drift-cyan/10 shadow-[0_0_20px_rgba(0,240,255,0.15)]"
                  : isCompleted
                  ? "border-emerald-500/40 bg-emerald-950/20"
                  : "border-slate-800 bg-[#0A0E17]/60 opacity-70"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-mono font-bold",
                    isActive
                      ? "bg-drift-cyan text-drift-dark"
                      : isCompleted
                      ? "bg-emerald-500 text-black"
                      : "bg-slate-800 text-slate-400"
                  )}
                >
                  {stage.stageNumber}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  Stage 0{stage.stageNumber}
                </span>
              </div>
              <div className="mt-3">
                <h4 className="text-xs font-semibold text-slate-100">{stage.shortName}</h4>
                <p className="mt-1 text-[11px] text-slate-400 line-clamp-2">{stage.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
